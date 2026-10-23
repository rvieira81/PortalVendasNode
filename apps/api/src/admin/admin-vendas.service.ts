import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, lt, SQL, sql } from 'drizzle-orm';
import { ErroNegocio, NaoEncontrado } from '../comum/erros';
import { Relogio } from '../comum/relogio';
import { Banco, BANCO } from '../db/db';
import { configuracao, faixaFrete, pedido, pedidoItem, usuario } from '../db/schema';
import { paraCentavos, paraDecimal, paraReais } from '../dominio/dinheiro';
import { DESCRICAO_STATUS_PEDIDO, StatusPedido } from '../dominio/status';
import { PedidoEstadoService } from '../pedidos/pedido-estado.service';
import { PedidosService } from '../pedidos/pedidos.service';

export interface FiltroPedidos {
  status?: number;
  de?: Date;
  ate?: Date;
  busca?: string;
  pagina: number;
}

const STATUS_VENDA = [StatusPedido.Pago, StatusPedido.EmSeparacao, StatusPedido.Enviado, StatusPedido.Entregue];

export interface ConfiguracoesLoja {
  cepOrigem: string;
  diasManuseio: number;
  freteGratisAPartirDe: number;
  parcelasMaximas: number;
  parcelaMinima: number;
}

@Injectable()
export class AdminVendasService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly relogio: Relogio,
    private readonly pedidos: PedidosService,
    private readonly estado: PedidoEstadoService,
  ) {}

  /** RF18 — lista e filtra por status, período e número/e-mail. */
  async listarPedidos(f: FiltroPedidos) {
    const condicoes: SQL[] = [];
    if (f.status) condicoes.push(eq(pedido.status, f.status));
    if (f.de) condicoes.push(gte(pedido.criadoEm, f.de));
    if (f.ate) condicoes.push(lt(pedido.criadoEm, f.ate));
    if (f.busca) {
      const termo = f.busca.trim();
      condicoes.push(/^\d+$/.test(termo) ? eq(pedido.id, Number(termo)) : sql`${usuario.email} ILIKE ${'%' + termo + '%'}`);
    }
    const onde = condicoes.length ? and(...condicoes) : undefined;
    const [{ total }] = await this.db.select({ total: count() }).from(pedido).innerJoin(usuario, eq(usuario.id, pedido.usuarioId)).where(onde);
    const linhas = await this.db
      .select({ id: pedido.id, status: pedido.status, total: pedido.total, criadoEm: pedido.criadoEm, cliente: usuario.nome, email: usuario.email, cidade: pedido.entregaCidade, uf: pedido.entregaUf })
      .from(pedido)
      .innerJoin(usuario, eq(usuario.id, pedido.usuarioId))
      .where(onde)
      .orderBy(desc(pedido.id))
      .limit(25)
      .offset((f.pagina - 1) * 25);
    return {
      itens: linhas.map((l) => ({ ...l, total: paraReais(paraCentavos(l.total)), statusDescricao: DESCRICAO_STATUS_PEDIDO[l.status as StatusPedido] })),
      total,
      pagina: f.pagina,
      paginas: Math.max(1, Math.ceil(total / 25)),
    };
  }

  async pedido(id: number) {
    const detalhe = await this.pedidos.detalhe(id, null);
    const [cliente] = await this.db.select({ nome: usuario.nome, email: usuario.email }).from(usuario).where(eq(usuario.id, detalhe.usuarioId!));
    return { ...detalhe, cliente };
  }

  /** RF18 — Em separação, Enviado (com rastreio) e Entregue. Transições inválidas → 409 (RN07). */
  async mudarStatus(id: number, status: StatusPedido, autor: string, codigoRastreio?: string, observacao?: string) {
    if (![StatusPedido.EmSeparacao, StatusPedido.Enviado, StatusPedido.Entregue].includes(status)) {
      throw new ErroNegocio('Status não pode ser definido manualmente.');
    }
    if (status === StatusPedido.Enviado && !codigoRastreio) throw new ErroNegocio('Informe o código de rastreio.');
    const ok = await this.estado.transitar(id, { para: status, autor, codigoRastreio, observacao });
    if (!ok) throw new ErroNegocio('O pedido já está neste status.');
    return this.pedido(id);
  }

  async cancelar(id: number, autor: string, motivo: string) {
    await this.pedidos.cancelar(id, autor, motivo, null);
    return this.pedido(id);
  }

  /** RF20 — faturamento, pedidos, ticket médio e mais vendidos no período. */
  async painel(de: Date, ate: Date) {
    const periodo = and(gte(pedido.criadoEm, de), lt(pedido.criadoEm, ate));
    const [vendas] = await this.db
      .select({ faturamento: sql<string>`coalesce(sum(${pedido.total}), 0)::text`, pedidos: count() })
      .from(pedido)
      .where(and(periodo, inArray(pedido.status, STATUS_VENDA)));
    const porStatus = await this.db.select({ status: pedido.status, quantidade: count() }).from(pedido).where(periodo).groupBy(pedido.status).orderBy(asc(pedido.status));
    const maisVendidos = await this.db
      .select({ produtoId: pedidoItem.produtoId, nome: sql<string>`max(${pedidoItem.nomeProduto})`, quantidade: sql<number>`sum(${pedidoItem.quantidade})::int`, receita: sql<string>`sum(${pedidoItem.total})::text` })
      .from(pedidoItem)
      .innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId))
      .where(and(periodo, inArray(pedido.status, STATUS_VENDA)))
      .groupBy(pedidoItem.produtoId)
      .orderBy(desc(sql`sum(${pedidoItem.quantidade})`))
      .limit(10);
    const faturamento = paraCentavos(vendas.faturamento);
    return {
      de,
      ate,
      faturamento: paraReais(faturamento),
      pedidos: vendas.pedidos,
      ticketMedio: vendas.pedidos ? paraReais(Math.round(faturamento / vendas.pedidos)) : 0,
      porStatus: porStatus.map((s) => ({ ...s, descricao: DESCRICAO_STATUS_PEDIDO[s.status as StatusPedido] })),
      maisVendidos: maisVendidos.map((m) => ({ ...m, receita: paraReais(paraCentavos(m.receita)) })),
    };
  }

  /* ---------------- Configurações (RF19) ---------------- */

  async configuracoes(): Promise<ConfiguracoesLoja> {
    const m = new Map((await this.db.select().from(configuracao)).map((l) => [l.chave, l.valor]));
    return {
      cepOrigem: m.get('frete.cep_origem') ?? '',
      diasManuseio: Number(m.get('frete.dias_manuseio') ?? 0),
      freteGratisAPartirDe: paraReais(paraCentavos(m.get('frete.gratis_a_partir_de') ?? '0')),
      parcelasMaximas: Number(m.get('pagamento.parcelas_maximas') ?? 12),
      parcelaMinima: paraReais(paraCentavos(m.get('pagamento.parcela_minima') ?? '10.00')),
    };
  }

  async salvarConfiguracoes(c: ConfiguracoesLoja, autor: string) {
    const agora = this.relogio.agora();
    const valores: [string, string][] = [
      ['frete.cep_origem', c.cepOrigem],
      ['frete.dias_manuseio', String(c.diasManuseio)],
      ['frete.gratis_a_partir_de', paraDecimal(paraCentavos(c.freteGratisAPartirDe.toFixed(2)))],
      ['pagamento.parcelas_maximas', String(c.parcelasMaximas)],
      ['pagamento.parcela_minima', paraDecimal(paraCentavos(c.parcelaMinima.toFixed(2)))],
    ];
    await this.db.transaction(async (tx) => {
      for (const [chave, valor] of valores) {
        await tx
          .insert(configuracao)
          .values({ chave, valor, alteradoEm: agora, alteradoPor: autor })
          .onConflictDoUpdate({ target: configuracao.chave, set: { valor, alteradoEm: agora, alteradoPor: autor } });
      }
    });
    return this.configuracoes();
  }

  async faixas() {
    const linhas = await this.db.select().from(faixaFrete).orderBy(asc(faixaFrete.cepInicio));
    return linhas.map((f) => ({ ...f, valor: paraReais(paraCentavos(f.valor)) }));
  }

  async salvarFaixa(d: { descricao: string; cepInicio: string; cepFim: string; valor: number; prazoDias: number; ativa: boolean }, id?: number) {
    if (d.cepInicio > d.cepFim) throw new ErroNegocio('O CEP inicial precisa ser menor ou igual ao final.');
    const valores = { ...d, valor: paraDecimal(paraCentavos(d.valor.toFixed(2))) };
    if (id) {
      const [f] = await this.db.update(faixaFrete).set({ ...valores, alteradoEm: this.relogio.agora() }).where(eq(faixaFrete.id, id)).returning();
      if (!f) throw new NaoEncontrado('Faixa não encontrada.');
    } else {
      await this.db.insert(faixaFrete).values(valores);
    }
    return this.faixas();
  }

  async excluirFaixa(id: number) {
    const removida = await this.db.delete(faixaFrete).where(eq(faixaFrete.id, id)).returning();
    if (!removida.length) throw new NaoEncontrado('Faixa não encontrada.');
    return this.faixas();
  }
}
