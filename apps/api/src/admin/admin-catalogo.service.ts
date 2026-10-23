import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { Config, CONFIG } from '../config/config';
import { Conflito, ErroNegocio, NaoEncontrado } from '../comum/erros';
import { Relogio } from '../comum/relogio';
import { Banco, BANCO } from '../db/db';
import { categoria, pedidoItem, produto, produtoImagem } from '../db/schema';
import { paraCentavos, paraDecimal, paraReais } from '../dominio/dinheiro';
import { gerarSlug } from '../dominio/slug';
import { urlImagem } from '../catalogo/catalogo.service';
import { apagarImagem, gravarImagem } from './imagens';

export interface DadosProduto {
  categoriaId: number;
  sku: string;
  nome: string;
  descricao: string;
  preco: number;
  precoDe: number | null;
  estoque: number;
  pesoKg: number;
  alturaCm: number;
  larguraCm: number;
  comprimentoCm: number;
  ativo: boolean;
}

const violacao = (erro: unknown): string | undefined => {
  const e = erro as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const c = e.cause ?? e;
  return c.code === '23505' || c.code === '23514' ? c.constraint : undefined;
};

@Injectable()
export class AdminCatalogoService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    @Inject(CONFIG) private readonly config: Config,
    private readonly relogio: Relogio,
  ) {}

  async listarProdutos(busca: string | undefined, pagina: number) {
    const filtro = busca ? or(ilike(produto.nome, `%${busca}%`), ilike(produto.sku, `%${busca}%`)) : undefined;
    const [{ total }] = await this.db.select({ total: count() }).from(produto).where(filtro);
    const linhas = await this.db
      .select({ produto, categoria: categoria.nome })
      .from(produto)
      .innerJoin(categoria, eq(categoria.id, produto.categoriaId))
      .where(filtro)
      .orderBy(desc(produto.id))
      .limit(20)
      .offset((pagina - 1) * 20);
    return {
      itens: linhas.map(({ produto: p, categoria: c }) => ({
        id: p.id,
        sku: p.sku,
        nome: p.nome,
        slug: p.slug,
        categoria: c,
        preco: paraReais(paraCentavos(p.preco)),
        estoque: p.estoque,
        reservado: p.estoqueReservado,
        ativo: p.ativo,
      })),
      total,
      pagina,
      paginas: Math.max(1, Math.ceil(total / 20)),
    };
  }

  async produto(id: number) {
    const [p] = await this.db.select().from(produto).where(eq(produto.id, id));
    if (!p) throw new NaoEncontrado('Produto não encontrado.');
    const imagens = await this.db.select().from(produtoImagem).where(eq(produtoImagem.produtoId, id)).orderBy(asc(produtoImagem.ordem), asc(produtoImagem.id));
    return {
      ...p,
      preco: paraReais(paraCentavos(p.preco)),
      precoDe: p.precoDe ? paraReais(paraCentavos(p.precoDe)) : null,
      pesoKg: Number(p.pesoKg),
      alturaCm: Number(p.alturaCm),
      larguraCm: Number(p.larguraCm),
      comprimentoCm: Number(p.comprimentoCm),
      imagens: imagens.map((i) => ({ id: i.id, url: urlImagem(i.arquivo) })),
    };
  }

  async salvarProduto(dados: DadosProduto, autor: string, id?: number) {
    if (dados.precoDe !== null && dados.precoDe <= dados.preco) throw new ErroNegocio('O preço "de" precisa ser maior que o preço de venda.');
    const valores = {
      categoriaId: dados.categoriaId,
      sku: dados.sku.toUpperCase(),
      nome: dados.nome,
      descricao: dados.descricao,
      preco: paraDecimal(paraCentavos(dados.preco.toFixed(2))),
      precoDe: dados.precoDe !== null ? paraDecimal(paraCentavos(dados.precoDe.toFixed(2))) : null,
      estoque: dados.estoque,
      pesoKg: dados.pesoKg.toFixed(3),
      alturaCm: dados.alturaCm.toFixed(1),
      larguraCm: dados.larguraCm.toFixed(1),
      comprimentoCm: dados.comprimentoCm.toFixed(1),
      ativo: dados.ativo,
    };
    try {
      if (id) {
        const [atual] = await this.db.select().from(produto).where(eq(produto.id, id));
        if (!atual) throw new NaoEncontrado('Produto não encontrado.');
        if (dados.estoque < atual.estoqueReservado) {
          throw new ErroNegocio(`O estoque não pode ficar abaixo do reservado em pedidos abertos (${atual.estoqueReservado}).`);
        }
        await this.db.update(produto).set({ ...valores, alteradoEm: this.relogio.agora(), alteradoPor: autor }).where(eq(produto.id, id));
        return this.produto(id);
      }
      const slug = await this.slugLivre(dados.nome);
      const [novo] = await this.db.insert(produto).values({ ...valores, slug, criadoPor: autor }).returning({ id: produto.id });
      return this.produto(novo.id);
    } catch (erro) {
      const c = violacao(erro);
      if (c === 'uq_produto_sku') throw new Conflito('Já existe um produto com este SKU.');
      if (c === 'fk_produto_categoria') throw new ErroNegocio('Categoria inválida.');
      if (c?.startsWith('ck_produto')) throw new ErroNegocio('Confira preço, estoque, peso e medidas (todos maiores que zero).');
      if ((erro as { cause?: { code?: string } }).cause?.code === '23503') throw new ErroNegocio('Categoria inválida.');
      throw erro;
    }
  }

  private async slugLivre(nome: string) {
    const base = gerarSlug(nome) || 'produto';
    for (let i = 0; i < 50; i++) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      const [existe] = await this.db.select({ id: produto.id }).from(produto).where(eq(produto.slug, slug));
      if (!existe) return slug;
    }
    return `${base}-${Date.now()}`;
  }

  async alterarAtivo(id: number, ativo: boolean, autor: string) {
    const [p] = await this.db.update(produto).set({ ativo, alteradoEm: this.relogio.agora(), alteradoPor: autor }).where(eq(produto.id, id)).returning({ id: produto.id });
    if (!p) throw new NaoEncontrado('Produto não encontrado.');
  }

  /** RF17 — produto com vendas é só desativado, para preservar o histórico. */
  async excluirProduto(id: number, autor: string) {
    const [vendido] = await this.db.select({ id: pedidoItem.id }).from(pedidoItem).where(eq(pedidoItem.produtoId, id)).limit(1);
    if (vendido) {
      await this.alterarAtivo(id, false, autor);
      return { desativado: true, mensagem: 'O produto já teve vendas e foi apenas desativado.' };
    }
    const imagens = await this.db.select().from(produtoImagem).where(eq(produtoImagem.produtoId, id));
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM carrinho_item WHERE produto_id = ${id}`);
      const removido = await tx.delete(produto).where(eq(produto.id, id)).returning({ id: produto.id });
      if (!removido.length) throw new NaoEncontrado('Produto não encontrado.');
    });
    for (const i of imagens) await apagarImagem(this.config.IMAGENS_DIR, i.arquivo);
    return { desativado: false, mensagem: 'Produto excluído.' };
  }

  async adicionarImagens(id: number, arquivos: { buffer: Buffer }[]) {
    await this.produto(id);
    if (!arquivos.length) throw new ErroNegocio('Selecione ao menos uma imagem.');
    const [{ quantidade }] = await this.db.select({ quantidade: count() }).from(produtoImagem).where(eq(produtoImagem.produtoId, id));
    if (quantidade + arquivos.length > 8) throw new ErroNegocio('Máximo de 8 imagens por produto.');
    const nomes: string[] = [];
    try {
      for (const a of arquivos) nomes.push(await gravarImagem(this.config.IMAGENS_DIR, a.buffer));
    } catch (erro) {
      for (const n of nomes) await apagarImagem(this.config.IMAGENS_DIR, n);
      throw erro;
    }
    await this.db.insert(produtoImagem).values(nomes.map((arquivo, i) => ({ produtoId: id, arquivo, ordem: quantidade + i })));
    return this.produto(id);
  }

  async removerImagem(id: number, imagemId: number) {
    const [img] = await this.db.delete(produtoImagem).where(and(eq(produtoImagem.id, imagemId), eq(produtoImagem.produtoId, id))).returning();
    if (!img) throw new NaoEncontrado('Imagem não encontrada.');
    await apagarImagem(this.config.IMAGENS_DIR, img.arquivo);
    return this.produto(id);
  }

  /* ---------------- Categorias ---------------- */

  listarCategorias() {
    return this.db
      .select({ id: categoria.id, nome: categoria.nome, slug: categoria.slug, ativa: categoria.ativa, produtos: sql<number>`(SELECT count(*)::int FROM produto WHERE categoria_id = ${categoria.id})` })
      .from(categoria)
      .orderBy(asc(categoria.nome));
  }

  async salvarCategoria(dados: { nome: string; ativa: boolean }, id?: number) {
    try {
      if (id) {
        const [c] = await this.db.update(categoria).set({ nome: dados.nome, ativa: dados.ativa, alteradoEm: this.relogio.agora() }).where(eq(categoria.id, id)).returning();
        if (!c) throw new NaoEncontrado('Categoria não encontrada.');
        return c;
      }
      const [c] = await this.db.insert(categoria).values({ nome: dados.nome, slug: gerarSlug(dados.nome), ativa: dados.ativa }).returning();
      return c;
    } catch (erro) {
      const c = violacao(erro);
      if (c === 'uq_categoria_nome' || c === 'uq_categoria_slug') throw new Conflito('Já existe uma categoria com este nome.');
      throw erro;
    }
  }
}
