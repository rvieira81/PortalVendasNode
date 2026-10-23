import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Config, CONFIG } from '../config/config';
import { Conflito, ErroNegocio, NaoEncontrado } from '../comum/erros';
import { Relogio } from '../comum/relogio';
import { UsuarioSessao } from '../comum/contexto';
import { Banco, BANCO } from '../db/db';
import { notificacaoGateway, pagamento, pedido, usuario } from '../db/schema';
import { somarDiasUteis } from '../dominio/dias-uteis';
import { paraCentavos, paraDecimal } from '../dominio/dinheiro';
import { parcelasPermitidas } from '../dominio/parcelas';
import { assinaturaWebhookValida } from '../dominio/seguranca';
import { MetodoPagamento, motivoRecusaAmigavel, StatusPagamento, statusPagamentoDoGateway, StatusPedido } from '../dominio/status';
import { CatalogoService } from '../catalogo/catalogo.service';
import { PedidoEstadoService } from '../pedidos/pedido-estado.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { ErroGateway, GatewayPagamento, MetodoGateway, PagamentoGateway } from './gateway';

export const PRAZO_PIX_MIN = 30; // RN04
export const PRAZO_BOLETO_DIAS_UTEIS = 3; // RN04

export interface DadosPagamento {
  metodo: MetodoGateway;
  cartao?: { token: string; parcelas: number; paymentMethodId: string; issuerId?: string };
}

export interface Notificacao {
  assinatura?: string;
  requestId?: string;
  tipo?: string;
  dataId?: string;
  corpo: unknown;
}

const METODO: Record<MetodoGateway, MetodoPagamento> = { pix: MetodoPagamento.Pix, cartao: MetodoPagamento.Cartao, boleto: MetodoPagamento.Boleto };

@Injectable()
export class PagamentosService {
  private readonly logger = new Logger('Pagamentos');

  constructor(
    @Inject(BANCO) private readonly db: Banco,
    @Inject(CONFIG) private readonly config: Config,
    private readonly relogio: Relogio,
    private readonly gateway: GatewayPagamento,
    private readonly estado: PedidoEstadoService,
    private readonly pedidos: PedidosService,
    private readonly catalogo: CatalogoService,
  ) {}

  async configuracaoPublica() {
    const { maximo, minima } = await this.catalogo.regrasParcelamento();
    return { publicKey: this.config.MP_PUBLIC_KEY, parcelasMaximas: maximo, parcelaMinima: minima / 100, configurado: this.gateway.configurado() };
  }

  /** RF10–RF12 — gera o pagamento no Mercado Pago para um pedido aguardando pagamento. */
  async iniciar(u: UsuarioSessao, pedidoId: number, dados: DadosPagamento) {
    const [p] = await this.db.select().from(pedido).where(and(eq(pedido.id, pedidoId), eq(pedido.usuarioId, u.id)));
    if (!p) throw new NaoEncontrado('Pedido não encontrado.');
    if (p.status !== StatusPedido.AguardandoPagamento) throw new Conflito('Este pedido não está aguardando pagamento.');
    const agora = this.relogio.agora();
    if (p.expiraEm && p.expiraEm < agora) throw new Conflito('O prazo para pagar este pedido terminou.');
    const metodo = METODO[dados.metodo];
    const total = paraCentavos(p.total);

    // Pix ou boleto ainda válido para o mesmo pedido: reaproveita em vez de gerar outro (RF14)
    if (metodo !== MetodoPagamento.Cartao) {
      const [vigente] = await this.db
        .select()
        .from(pagamento)
        .where(and(eq(pagamento.pedidoId, pedidoId), eq(pagamento.metodo, metodo), eq(pagamento.status, StatusPagamento.Pendente), isNotNull(pagamento.gatewayId)))
        .orderBy(desc(pagamento.id))
        .limit(1);
      if (vigente && (!vigente.expiraEm || vigente.expiraEm > agora)) return this.pedidos.detalhe(pedidoId, u.id);
    }

    if (metodo === MetodoPagamento.Cartao) {
      const { maximo, minima } = await this.catalogo.regrasParcelamento();
      const permitidas = parcelasPermitidas(total, maximo, minima);
      if (!dados.cartao || dados.cartao.parcelas < 1 || dados.cartao.parcelas > permitidas) {
        throw new ErroNegocio(`Parcelamento permitido: de 1 a ${permitidas} vez(es).`, HttpStatus.BAD_REQUEST); // RN06
      }
    }

    const [cliente] = await this.db.select().from(usuario).where(eq(usuario.id, u.id));
    if (!cliente?.cpf) throw new ErroNegocio('Informe seu CPF no cadastro para pagar.');

    const expiraEm =
      metodo === MetodoPagamento.Pix
        ? new Date(agora.getTime() + PRAZO_PIX_MIN * 60_000)
        : metodo === MetodoPagamento.Boleto
          ? fimDoDia(somarDiasUteis(agora, PRAZO_BOLETO_DIAS_UTEIS))
          : undefined;

    const chave = randomUUID();
    const [registro] = await this.db
      .insert(pagamento)
      .values({ pedidoId, metodo, status: StatusPagamento.Pendente, chaveIdempotencia: chave, valor: paraDecimal(total), parcelas: dados.cartao?.parcelas ?? null, expiraEm: expiraEm ?? null })
      .returning();

    let resposta: PagamentoGateway;
    try {
      resposta = await this.gateway.criar({
        chaveIdempotencia: chave,
        pedidoId,
        valor: total,
        descricao: `Pedido #${pedidoId} - ${this.config.NOME_LOJA}`,
        metodo: dados.metodo,
        expiraEm,
        pagador: {
          email: cliente.email,
          nome: cliente.nome,
          cpf: cliente.cpf,
          cep: p.entregaCep,
          logradouro: p.entregaLogradouro,
          numero: p.entregaNumero,
          bairro: p.entregaBairro,
          cidade: p.entregaCidade,
          uf: p.entregaUf,
        },
        cartao: dados.cartao,
      });
    } catch (erro) {
      await this.db.update(pagamento).set({ status: StatusPagamento.Cancelado, statusDetalhe: 'erro_gateway', alteradoEm: agora }).where(eq(pagamento.id, registro.id));
      this.logger.error({ err: erro, detalhe: erro instanceof ErroGateway ? erro.detalhe : undefined }, `Falha ao criar pagamento do pedido ${pedidoId}`);
      throw new ErroNegocio('Não foi possível gerar o pagamento agora. Tente de novo ou escolha outra forma de pagamento.', HttpStatus.BAD_GATEWAY);
    }

    await this.registrarResposta(registro.id, resposta);
    if (metodo !== MetodoPagamento.Cartao && expiraEm) {
      // O pedido passa a vencer junto com o Pix/boleto (RN04)
      await this.db.update(pedido).set({ expiraEm: resposta.expiraEm ?? expiraEm }).where(eq(pedido.id, pedidoId));
    }
    await this.aplicarStatus(registro.id, resposta, 'mercadopago');

    const detalhe = await this.pedidos.detalhe(pedidoId, u.id);
    const status = statusPagamentoDoGateway(resposta.status);
    return {
      ...detalhe,
      ...(status === StatusPagamento.Recusado ? { recusa: motivoRecusaAmigavel(resposta.statusDetalhe) } : {}),
    };
  }

  private async registrarResposta(pagamentoId: number, r: PagamentoGateway) {
    await this.db
      .update(pagamento)
      .set({
        gatewayId: r.id,
        statusGateway: r.status.slice(0, 30),
        statusDetalhe: r.statusDetalhe?.slice(0, 100) ?? null,
        bandeira: r.bandeira?.slice(0, 30) ?? null,
        ultimosDigitos: r.ultimosDigitos?.slice(-4) ?? null,
        parcelas: r.parcelas,
        pixQrCode: r.pixQrCode?.slice(0, 1000) ?? null,
        pixQrCodeBase64: r.pixQrCodeBase64,
        boletoUrl: r.boletoUrl?.slice(0, 500) ?? null,
        boletoLinhaDigitavel: r.boletoLinhaDigitavel?.slice(0, 60) ?? null,
        ...(r.expiraEm ? { expiraEm: r.expiraEm } : {}),
        alteradoEm: this.relogio.agora(),
      })
      .where(eq(pagamento.id, pagamentoId));
  }

  /**
   * Aplica o status consultado na API ao pagamento e ao pedido (RN08).
   * Aprovação de pedido já pago por outro pagamento, cancelado ou expirado → estorno automático.
   */
  private async aplicarStatus(pagamentoId: number, r: PagamentoGateway, autor: string) {
    const novo = statusPagamentoDoGateway(r.status);
    const [pag] = await this.db
      .update(pagamento)
      .set({ status: novo, statusGateway: r.status.slice(0, 30), statusDetalhe: r.statusDetalhe?.slice(0, 100) ?? null, alteradoEm: this.relogio.agora() })
      .where(eq(pagamento.id, pagamentoId))
      .returning();
    if (!pag) return;
    const [p] = await this.db.select().from(pedido).where(eq(pedido.id, pag.pedidoId));
    if (!p) return;

    if (novo === StatusPagamento.Aprovado) {
      if (paraCentavos(p.total) !== r.valor) {
        this.logger.error(`Valor aprovado (${r.valor}) diferente do total do pedido ${p.id} (${p.total}); estornando`);
        await this.pedidos.estornar(pag, 'Valor divergente do pedido');
        return;
      }
      const pago = await this.estado.transitar(p.id, {
        para: StatusPedido.Pago,
        autor,
        observacao: `Pagamento ${r.id} aprovado`,
        somenteSe: [StatusPedido.AguardandoPagamento, StatusPedido.PagamentoEmAnalise],
      });
      if (!pago) {
        const outroAprovado = await this.db
          .select({ id: pagamento.id })
          .from(pagamento)
          .where(and(eq(pagamento.pedidoId, p.id), eq(pagamento.status, StatusPagamento.Aprovado), sql`${pagamento.id} <> ${pag.id}`));
        const [atual] = await this.db.select({ status: pedido.status }).from(pedido).where(eq(pedido.id, p.id));
        if (atual.status === StatusPedido.Cancelado || outroAprovado.length) {
          this.logger.warn(`Pagamento ${r.id} aprovado para o pedido ${p.id} já ${outroAprovado.length ? 'pago' : 'cancelado'}: estorno automático`);
          await this.pedidos.estornar(pag, outroAprovado.length ? 'Pagamento duplicado' : 'Pedido já cancelado');
        }
      }
    } else if (novo === StatusPagamento.EmAnalise) {
      await this.estado.transitar(p.id, { para: StatusPedido.PagamentoEmAnalise, autor, somenteSe: [StatusPedido.AguardandoPagamento] });
    } else if (novo === StatusPagamento.Recusado || novo === StatusPagamento.Cancelado) {
      // Volta a aguardar pagamento: o cliente pode tentar outro cartão ou outro meio (RF11)
      await this.estado.transitar(p.id, { para: StatusPedido.AguardandoPagamento, autor, observacao: `Pagamento ${r.id} ${novo === StatusPagamento.Recusado ? 'recusado' : 'cancelado'}`, somenteSe: [StatusPedido.PagamentoEmAnalise] });
    } else if (novo === StatusPagamento.Estornado || novo === StatusPagamento.Contestado) {
      this.logger.warn(`Pagamento ${r.id} do pedido ${p.id}: ${r.status}`);
      if (novo === StatusPagamento.Estornado) {
        await this.estado.transitar(p.id, { para: StatusPedido.Cancelado, autor, observacao: 'Pagamento estornado no Mercado Pago', somenteSe: [StatusPedido.Pago, StatusPedido.EmSeparacao] });
      }
    }
  }

  /** Consulta o pagamento na API e aplica o resultado. Nunca confia no corpo da notificação (RF13). */
  async sincronizar(gatewayId: number, autor = 'mercadopago') {
    const r = await this.gateway.consultar(gatewayId);
    let [pag] = await this.db.select().from(pagamento).where(eq(pagamento.gatewayId, gatewayId));
    if (!pag && r.referenciaExterna && /^\d+$/.test(r.referenciaExterna)) {
      // Resposta da criação perdida (timeout): associa pelo pedido
      [pag] = await this.db
        .select()
        .from(pagamento)
        .where(and(eq(pagamento.pedidoId, Number(r.referenciaExterna)), sql`${pagamento.gatewayId} IS NULL`))
        .orderBy(desc(pagamento.id))
        .limit(1);
    }
    if (!pag) {
      this.logger.warn(`Pagamento ${gatewayId} do Mercado Pago não corresponde a nenhum pagamento local`);
      return false;
    }
    await this.registrarResposta(pag.id, r);
    await this.aplicarStatus(pag.id, r, autor);
    return true;
  }

  /** RF13 — webhook: assinatura obrigatória, deduplicação por x-request-id, consulta à API. */
  async receberNotificacao(n: Notificacao): Promise<{ status: number }> {
    const dataId = (n.dataId ?? '').slice(0, 50);
    const tipo = (n.tipo ?? 'desconhecido').slice(0, 50);
    const valida = assinaturaWebhookValida(n.assinatura, n.requestId, dataId, this.config.MP_SEGREDO_WEBHOOK);
    const [registro] = await this.db
      .insert(notificacaoGateway)
      .values({ requestId: n.requestId?.slice(0, 100) ?? null, topico: tipo, recursoId: dataId || '-', corpo: JSON.stringify(n.corpo ?? null).slice(0, 20_000), assinaturaValida: valida })
      .onConflictDoNothing()
      .returning();
    if (!registro) return { status: 200 }; // mesma notificação de novo: já tratada
    if (!valida) {
      this.logger.warn(`Webhook com assinatura inválida (request-id ${n.requestId ?? '-'})`);
      return { status: 401 };
    }
    try {
      if (tipo === 'payment' && /^\d+$/.test(dataId)) await this.sincronizar(Number(dataId));
      await this.db.update(notificacaoGateway).set({ processada: true, processadaEm: this.relogio.agora() }).where(eq(notificacaoGateway.id, registro.id));
      return { status: 200 };
    } catch (erro) {
      this.logger.error({ err: erro }, `Falha ao processar o webhook ${registro.id}`);
      await this.db.update(notificacaoGateway).set({ erro: String((erro as Error).message).slice(0, 1000) }).where(eq(notificacaoGateway.id, registro.id));
      return { status: 500 }; // o Mercado Pago reenvia
    }
  }

  /** Job: consulta pagamentos pendentes/em análise com mais de 2 minutos (cobre webhook perdido). */
  async conciliarPendentes(limite = 50) {
    const corte = new Date(this.relogio.agora().getTime() - 2 * 60_000);
    const pendentes = await this.db
      .select({ gatewayId: pagamento.gatewayId })
      .from(pagamento)
      .where(and(inArray(pagamento.status, [StatusPagamento.Pendente, StatusPagamento.EmAnalise]), isNotNull(pagamento.gatewayId), lt(pagamento.criadoEm, corte)))
      .orderBy(pagamento.alteradoEm)
      .limit(limite);
    let conciliados = 0;
    for (const p of pendentes) {
      try {
        if (await this.sincronizar(p.gatewayId!, 'sistema:conciliacao')) conciliados++;
      } catch (erro) {
        this.logger.warn(`Conciliação do pagamento ${p.gatewayId} falhou: ${(erro as Error).message}`);
      }
    }
    return conciliados;
  }

  /** Job: cancela pedidos vencidos (RN04). Antes, confere no gateway se não foram pagos no último instante. */
  async expirarPedidos(limite = 100) {
    const agora = this.relogio.agora();
    const vencidos = await this.db
      .select({ id: pedido.id })
      .from(pedido)
      .where(and(eq(pedido.status, StatusPedido.AguardandoPagamento), lt(pedido.expiraEm, agora)))
      .limit(limite);
    let expirados = 0;
    for (const { id } of vencidos) {
      const pagos = await this.db
        .select({ gatewayId: pagamento.gatewayId })
        .from(pagamento)
        .where(and(eq(pagamento.pedidoId, id), isNotNull(pagamento.gatewayId), inArray(pagamento.status, [StatusPagamento.Pendente, StatusPagamento.EmAnalise])));
      for (const g of pagos) {
        try {
          await this.sincronizar(g.gatewayId!, 'sistema:expiracao');
        } catch (erro) {
          this.logger.warn(`Consulta antes de expirar o pedido ${id} falhou: ${(erro as Error).message}`);
        }
      }
      const cancelou = await this.estado.transitar(id, { para: StatusPedido.Cancelado, autor: 'sistema', observacao: 'Prazo de pagamento expirado', somenteSe: [StatusPedido.AguardandoPagamento] });
      if (cancelou) {
        await this.db
          .update(pagamento)
          .set({ status: StatusPagamento.Cancelado, statusDetalhe: 'expirado', alteradoEm: agora })
          .where(and(eq(pagamento.pedidoId, id), eq(pagamento.status, StatusPagamento.Pendente)));
        expirados++;
      }
    }
    return expirados;
  }
}

function fimDoDia(data: Date): Date {
  // 23:59:59 no horário de Brasília (UTC-3)
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate(), 23 + 3, 59, 59));
  return d;
}
