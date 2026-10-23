import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, lte, sql, SQL } from 'drizzle-orm';
import { NaoEncontrado } from '../comum/erros';
import { Banco, BANCO } from '../db/db';
import { categoria, configuracao, produto, produtoImagem } from '../db/schema';
import { paraCentavos, paraReais } from '../dominio/dinheiro';
import { parcelasPermitidas } from '../dominio/parcelas';

export const TAMANHO_PAGINA = 12;
export const urlImagem = (arquivo: string) => `/api/imagens/${arquivo}`;

export interface FiltroVitrine {
  busca?: string;
  categoria?: string;
  precoMin?: number;
  precoMax?: number;
  ordem?: 'recentes' | 'menor-preco' | 'maior-preco' | 'nome';
  pagina?: number;
}

@Injectable()
export class CatalogoService {
  constructor(@Inject(BANCO) private readonly db: Banco) {}

  async categorias() {
    return this.db
      .select({ id: categoria.id, nome: categoria.nome, slug: categoria.slug })
      .from(categoria)
      .where(eq(categoria.ativa, true))
      .orderBy(asc(categoria.nome));
  }

  /** RF01/RF02 — vitrine paginada no banco, só produtos ativos de categorias ativas. */
  async vitrine(filtro: FiltroVitrine) {
    const pagina = Math.max(1, filtro.pagina ?? 1);
    const condicoes: SQL[] = [eq(produto.ativo, true), eq(categoria.ativa, true)];
    if (filtro.categoria) condicoes.push(eq(categoria.slug, filtro.categoria));
    if (filtro.precoMin !== undefined) condicoes.push(gte(produto.preco, filtro.precoMin.toFixed(2)));
    if (filtro.precoMax !== undefined) condicoes.push(lte(produto.preco, filtro.precoMax.toFixed(2)));
    const termo = filtro.busca?.trim();
    if (termo) {
      // Sem diferenciar maiúsculas e acentos, usando o índice trigram (ix_produto_busca)
      const padrao = `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      condicoes.push(sql`f_sem_acento(${produto.nome} || ' ' || ${produto.descricao}) LIKE f_sem_acento(${padrao})`);
    }
    const onde = and(...condicoes);
    const ordem = {
      'menor-preco': [asc(produto.preco), asc(produto.id)],
      'maior-preco': [desc(produto.preco), asc(produto.id)],
      nome: [asc(produto.nome)],
      recentes: [desc(produto.criadoEm), desc(produto.id)],
    }[filtro.ordem ?? 'recentes'];

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(produto)
      .innerJoin(categoria, eq(categoria.id, produto.categoriaId))
      .where(onde);

    const linhas = await this.db
      .select({
        id: produto.id,
        nome: produto.nome,
        slug: produto.slug,
        preco: produto.preco,
        precoDe: produto.precoDe,
        estoque: produto.estoque,
        reservado: produto.estoqueReservado,
        categoria: categoria.nome,
        categoriaSlug: categoria.slug,
      })
      .from(produto)
      .innerJoin(categoria, eq(categoria.id, produto.categoriaId))
      .where(onde)
      .orderBy(...ordem)
      .limit(TAMANHO_PAGINA)
      .offset((pagina - 1) * TAMANHO_PAGINA);

    const capas = await this.capas(linhas.map((l) => l.id));
    return {
      itens: linhas.map((l) => {
        const disponivel = Math.max(0, l.estoque - l.reservado);
        return {
          id: l.id,
          nome: l.nome,
          slug: l.slug,
          preco: paraReais(paraCentavos(l.preco)),
          precoDe: l.precoDe ? paraReais(paraCentavos(l.precoDe)) : null,
          disponivel,
          esgotado: disponivel === 0,
          categoria: l.categoria,
          categoriaSlug: l.categoriaSlug,
          imagem: capas.get(l.id) ?? null,
        };
      }),
      total,
      pagina,
      tamanhoPagina: TAMANHO_PAGINA,
      paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)),
    };
  }

  /** RF03 — detalhe; inexistente ou inativo → 404. */
  async detalhe(slug: string) {
    const [p] = await this.db
      .select({ produto, categoriaNome: categoria.nome, categoriaSlug: categoria.slug, categoriaAtiva: categoria.ativa })
      .from(produto)
      .innerJoin(categoria, eq(categoria.id, produto.categoriaId))
      .where(eq(produto.slug, slug));
    if (!p || !p.produto.ativo || !p.categoriaAtiva) throw new NaoEncontrado('Produto não encontrado.');
    const imagens = await this.db
      .select({ arquivo: produtoImagem.arquivo })
      .from(produtoImagem)
      .where(eq(produtoImagem.produtoId, p.produto.id))
      .orderBy(asc(produtoImagem.ordem), asc(produtoImagem.id));
    const preco = paraCentavos(p.produto.preco);
    const { maximo, minima } = await this.regrasParcelamento();
    const parcelas = parcelasPermitidas(preco, maximo, minima);
    const disponivel = Math.max(0, p.produto.estoque - p.produto.estoqueReservado);
    return {
      id: p.produto.id,
      sku: p.produto.sku,
      nome: p.produto.nome,
      slug: p.produto.slug,
      descricao: p.produto.descricao,
      preco: paraReais(preco),
      precoDe: p.produto.precoDe ? paraReais(paraCentavos(p.produto.precoDe)) : null,
      disponivel,
      esgotado: disponivel === 0,
      maximoNoCarrinho: Math.min(10, disponivel),
      parcelas: { quantidade: parcelas, valor: paraReais(Math.floor(preco / Math.max(parcelas, 1))) },
      dimensoes: {
        pesoKg: Number(p.produto.pesoKg),
        alturaCm: Number(p.produto.alturaCm),
        larguraCm: Number(p.produto.larguraCm),
        comprimentoCm: Number(p.produto.comprimentoCm),
      },
      categoria: { nome: p.categoriaNome, slug: p.categoriaSlug },
      imagens: imagens.map((i) => urlImagem(i.arquivo)),
    };
  }

  async capas(ids: number[]): Promise<Map<number, string>> {
    if (!ids.length) return new Map();
    const imagens = await this.db
      .selectDistinctOn([produtoImagem.produtoId], { produtoId: produtoImagem.produtoId, arquivo: produtoImagem.arquivo })
      .from(produtoImagem)
      .where(inArray(produtoImagem.produtoId, ids))
      .orderBy(produtoImagem.produtoId, asc(produtoImagem.ordem), asc(produtoImagem.id));
    return new Map(imagens.map((i) => [i.produtoId, urlImagem(i.arquivo)]));
  }

  async regrasParcelamento() {
    const linhas = await this.db
      .select()
      .from(configuracao)
      .where(inArray(configuracao.chave, ['pagamento.parcelas_maximas', 'pagamento.parcela_minima']));
    const mapa = new Map(linhas.map((l) => [l.chave, l.valor]));
    return {
      maximo: Number(mapa.get('pagamento.parcelas_maximas') ?? 12),
      minima: paraCentavos(mapa.get('pagamento.parcela_minima') ?? '10.00'),
    };
  }
}
