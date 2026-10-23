import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { ErroNegocio } from '../comum/erros';
import { Banco, BANCO, BancoOuTransacao } from '../db/db';
import { carrinho, carrinhoItem, categoria, produto } from '../db/schema';
import { paraCentavos, paraReais } from '../dominio/dinheiro';
import { quantidadeMaxima } from '../dominio/totais';
import { CatalogoService } from '../catalogo/catalogo.service';

export interface DonoCarrinho {
  usuarioId?: number;
  token?: string;
}

export interface ItemCarrinhoDetalhado {
  produtoId: number;
  sku: string;
  nome: string;
  slug: string;
  imagem: string | null;
  quantidade: number;
  disponivel: number;
  precoUnitario: number; // centavos
  precoNaInclusao: number; // centavos
  pesoKg: number;
  alturaCm: number;
  larguraCm: number;
  comprimentoCm: number;
  ativo: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class CarrinhoService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly catalogo: CatalogoService,
  ) {}

  private async localizar(dono: DonoCarrinho, db: BancoOuTransacao = this.db) {
    if (dono.usuarioId) {
      const [c] = await db.select().from(carrinho).where(eq(carrinho.usuarioId, dono.usuarioId));
      return c ?? null;
    }
    if (dono.token && UUID.test(dono.token)) {
      const [c] = await db.select().from(carrinho).where(and(eq(carrinho.token, dono.token), isNull(carrinho.usuarioId)));
      return c ?? null;
    }
    return null;
  }

  private async localizarOuCriar(dono: DonoCarrinho) {
    const existente = await this.localizar(dono);
    if (existente) return existente;
    const [novo] = await this.db
      .insert(carrinho)
      .values({ usuarioId: dono.usuarioId ?? null })
      .onConflictDoNothing()
      .returning();
    return novo ?? (await this.localizar(dono))!;
  }

  async itens(dono: DonoCarrinho, db: BancoOuTransacao = this.db): Promise<ItemCarrinhoDetalhado[]> {
    const c = await this.localizar(dono, db);
    if (!c) return [];
    const linhas = await db
      .select({
        produtoId: produto.id,
        sku: produto.sku,
        nome: produto.nome,
        slug: produto.slug,
        quantidade: carrinhoItem.quantidade,
        precoNaInclusao: carrinhoItem.precoNaInclusao,
        preco: produto.preco,
        estoque: produto.estoque,
        reservado: produto.estoqueReservado,
        ativo: sql<boolean>`${produto.ativo} AND ${categoria.ativa}`,
        pesoKg: produto.pesoKg,
        alturaCm: produto.alturaCm,
        larguraCm: produto.larguraCm,
        comprimentoCm: produto.comprimentoCm,
      })
      .from(carrinhoItem)
      .innerJoin(produto, eq(produto.id, carrinhoItem.produtoId))
      .innerJoin(categoria, eq(categoria.id, produto.categoriaId))
      .where(eq(carrinhoItem.carrinhoId, c.id))
      .orderBy(carrinhoItem.id);
    const capas = await this.catalogo.capas(linhas.map((l) => l.produtoId));
    return linhas.map((l) => ({
      produtoId: l.produtoId,
      sku: l.sku,
      nome: l.nome,
      slug: l.slug,
      imagem: capas.get(l.produtoId) ?? null,
      quantidade: l.quantidade,
      disponivel: Math.max(0, l.estoque - l.reservado),
      precoUnitario: paraCentavos(l.preco),
      precoNaInclusao: paraCentavos(l.precoNaInclusao),
      pesoKg: Number(l.pesoKg),
      alturaCm: Number(l.alturaCm),
      larguraCm: Number(l.larguraCm),
      comprimentoCm: Number(l.comprimentoCm),
      ativo: l.ativo,
    }));
  }

  /** Resposta da API: preços atuais, avisos de preço alterado e de falta de estoque (RF04). */
  async ver(dono: DonoCarrinho) {
    const itens = await this.itens(dono);
    const avisos: string[] = [];
    const saida = itens.map((i) => {
      const problemas: string[] = [];
      if (!i.ativo) problemas.push('Produto indisponível');
      else if (i.disponivel === 0) problemas.push('Esgotado');
      else if (i.quantidade > i.disponivel) problemas.push(`Só ${i.disponivel} disponível(is)`);
      const precoMudou = i.precoUnitario !== i.precoNaInclusao;
      if (precoMudou) avisos.push(`O preço de "${i.nome}" mudou de R$ ${(i.precoNaInclusao / 100).toFixed(2).replace('.', ',')} para R$ ${(i.precoUnitario / 100).toFixed(2).replace('.', ',')}.`);
      return {
        produtoId: i.produtoId,
        nome: i.nome,
        slug: i.slug,
        imagem: i.imagem,
        quantidade: i.quantidade,
        maximo: quantidadeMaxima(i.disponivel),
        precoUnitario: paraReais(i.precoUnitario),
        precoAnterior: precoMudou ? paraReais(i.precoNaInclusao) : null,
        total: paraReais(i.precoUnitario * i.quantidade),
        problemas,
      };
    });
    const subtotal = itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0);
    return {
      itens: saida,
      quantidadeItens: itens.reduce((s, i) => s + i.quantidade, 0),
      subtotal: paraReais(subtotal),
      avisos,
      podeFinalizar: saida.length > 0 && saida.every((i) => i.problemas.length === 0),
    };
  }

  /** Adiciona (soma) ou define a quantidade. Acima do disponível: limita e avisa "Quantidade indisponível". */
  async definir(dono: DonoCarrinho, produtoId: number, quantidade: number, somar: boolean) {
    const [p] = await this.db
      .select({ id: produto.id, preco: produto.preco, estoque: produto.estoque, reservado: produto.estoqueReservado, ativo: produto.ativo })
      .from(produto)
      .where(eq(produto.id, produtoId));
    if (!p || !p.ativo) throw new ErroNegocio('Produto indisponível.');
    const maximo = quantidadeMaxima(p.estoque - p.reservado);
    if (maximo === 0) throw new ErroNegocio('Produto esgotado.');

    const c = await this.localizarOuCriar(dono);
    const [atual] = await this.db
      .select()
      .from(carrinhoItem)
      .where(and(eq(carrinhoItem.carrinhoId, c.id), eq(carrinhoItem.produtoId, produtoId)));
    const desejada = somar ? (atual?.quantidade ?? 0) + quantidade : quantidade;
    const final = Math.min(desejada, maximo);

    if (atual) {
      await this.db.update(carrinhoItem).set({ quantidade: final }).where(eq(carrinhoItem.id, atual.id));
    } else {
      await this.db.insert(carrinhoItem).values({ carrinhoId: c.id, produtoId, quantidade: final, precoNaInclusao: p.preco });
    }
    await this.db.update(carrinho).set({ atualizadoEm: new Date() }).where(eq(carrinho.id, c.id));
    return {
      token: c.usuarioId ? undefined : c.token,
      aviso: desejada > maximo ? `Quantidade indisponível. Máximo de ${maximo} unidade(s) para este produto.` : undefined,
    };
  }

  async remover(dono: DonoCarrinho, produtoId: number) {
    const c = await this.localizar(dono);
    if (!c) return;
    await this.db.delete(carrinhoItem).where(and(eq(carrinhoItem.carrinhoId, c.id), eq(carrinhoItem.produtoId, produtoId)));
  }

  /** RF04 — no login, os itens do carrinho do visitante passam para o carrinho da conta. */
  async mesclar(token: string | undefined, usuarioId: number) {
    if (!token || !UUID.test(token)) return;
    await this.db.transaction(async (tx) => {
      const anonimo = await this.localizar({ token }, tx);
      if (!anonimo) return;
      const [daConta] = await tx.select().from(carrinho).where(eq(carrinho.usuarioId, usuarioId));
      if (!daConta) {
        await tx.update(carrinho).set({ usuarioId, atualizadoEm: new Date() }).where(eq(carrinho.id, anonimo.id));
        return;
      }
      const itensAnonimos = await tx.select().from(carrinhoItem).where(eq(carrinhoItem.carrinhoId, anonimo.id));
      for (const item of itensAnonimos) {
        await tx
          .insert(carrinhoItem)
          .values({ carrinhoId: daConta.id, produtoId: item.produtoId, quantidade: item.quantidade, precoNaInclusao: item.precoNaInclusao })
          .onConflictDoUpdate({
            target: [carrinhoItem.carrinhoId, carrinhoItem.produtoId],
            set: { quantidade: sql`LEAST(10, ${carrinhoItem.quantidade} + excluded.quantidade)` },
          });
      }
      await tx.delete(carrinho).where(eq(carrinho.id, anonimo.id));
      await tx.update(carrinho).set({ atualizadoEm: new Date() }).where(eq(carrinho.id, daConta.id));
    });
  }

  async esvaziar(usuarioId: number, produtoIds: number[], db: BancoOuTransacao = this.db) {
    const c = await this.localizar({ usuarioId }, db);
    if (!c || !produtoIds.length) return;
    await db.delete(carrinhoItem).where(and(eq(carrinhoItem.carrinhoId, c.id), inArray(carrinhoItem.produtoId, produtoIds)));
  }
}
