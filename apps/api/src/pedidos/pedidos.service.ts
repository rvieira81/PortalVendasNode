import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Conflito, ErroNegocio, NaoEncontrado } from '../comum/erros';
import { Relogio } from '../comum/relogio';
import { UsuarioSessao } from '../comum/contexto';
import { Banco, BANCO } from '../db/db';
import { endereco, pagamento, pedido, pedidoHistorico, pedidoItem, produto, usuario } from '../db/schema';
import { paraCentavos, paraDecimal, paraReais } from '../dominio/dinheiro';
import { calcularTotais } from '../dominio/totais';
import { clientePodeCancelar, DESCRICAO_STATUS_PEDIDO, MetodoPagamento, StatusPagamento, StatusPedido } from '../dominio/status';
import { CarrinhoService } from '../carrinho/carrinho.service';
import { CatalogoService } from '../catalogo/catalogo.service';
import { FreteService } from '../frete/frete.service';
import { volumesDoCarrinho } from '../frete/volumes';
import { EmailService } from '../email/email.service';
import { GatewayPagamento } from '../pagamentos/gateway';
import { PedidoEstadoService } from './pedido-estado.service';

/** Prazo para escolher a forma de pagamento; ao gerar Pix/boleto vale o prazo do meio (RN04). */
export const PRAZO_ESCOLHA_PAGAMENTO_MIN = 60;

export interface NovoPedido {
  enderecoId: number;
  freteCodigo: string;
  chaveIdempotencia: string;
}

@Injectable()
export class PedidosService {
  private readonly logger = new Logger('Pedidos');

  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly relogio: Relogio,
    private readonly carrinho: CarrinhoService,
    private readonly catalogo: CatalogoService,
    private readonly frete: FreteService,
    private readonly estado: PedidoEstadoService,
    private readonly gateway: GatewayPagamento,
    private readonly email: EmailService,
  ) {}

  /**
   * RF09 — cria o pedido a partir do carrinho:
   * recalcula preços e frete no servidor (RN05), reserva o estoque de forma atômica (RN02/RN03)
   * e é idempotente pela chave enviada pelo navegador (duplo clique).
   */
  async criar(u: UsuarioSessao, dados: NovoPedido) {
    try {
      return await this.criarSemRepetir(u, dados);
    } catch (erro) {
      // Dois cliques simultâneos: o segundo pode encontrar o carrinho já vazio ou bater na
      // constraint única da chave. Se o primeiro criou o pedido, devolve o mesmo pedido.
      const [outro] = await this.db.select({ id: pedido.id, usuarioId: pedido.usuarioId }).from(pedido).where(eq(pedido.chaveIdempotencia, dados.chaveIdempotencia));
      if (outro && outro.usuarioId === u.id) return { id: outro.id, repetido: true };
      throw erro;
    }
  }

  private async criarSemRepetir(u: UsuarioSessao, dados: NovoPedido) {
    const [existente] = await this.db.select().from(pedido).where(eq(pedido.chaveIdempotencia, dados.chaveIdempotencia));
    if (existente) {
      if (existente.usuarioId !== u.id) throw new Conflito('Chave de pedido inválida. Recarregue a página.');
      return { id: existente.id, repetido: true };
    }

    if (!u.emailConfirmado) throw new ErroNegocio('Confirme seu e-mail antes de finalizar a compra.', HttpStatus.FORBIDDEN, { codigo: 'email-nao-confirmado' });
    const [cliente] = await this.db.select({ cpf: usuario.cpf }).from(usuario).where(eq(usuario.id, u.id));
    if (!cliente?.cpf) throw new ErroNegocio('Informe seu CPF no cadastro para finalizar a compra.'); // RN10

    const [end] = await this.db.select().from(endereco).where(and(eq(endereco.id, dados.enderecoId), eq(endereco.usuarioId, u.id)));
    if (!end) throw new NaoEncontrado('Endereço não encontrado.');

    const itens = await this.carrinho.itens({ usuarioId: u.id });
    if (!itens.length) throw new ErroNegocio('O carrinho está vazio.');
    const inativos = itens.filter((i) => !i.ativo);
    if (inativos.length) {
      throw new Conflito('Alguns produtos não estão mais à venda. Remova-os do carrinho.', { indisponiveis: inativos.map((i) => i.nome) });
    }

    const subtotalCarrinho = itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0);
    const opcoes = await this.frete.cotar(end.cep, volumesDoCarrinho(itens), subtotalCarrinho);
    const opcao = opcoes.find((o) => o.codigo === dados.freteCodigo);
    if (!opcao) throw new Conflito('A opção de frete mudou. Escolha o frete novamente.', { codigo: 'frete-alterado' });

    const totais = calcularTotais(itens.map((i) => ({ precoUnitario: i.precoUnitario, quantidade: i.quantidade })), opcao.valor);
    const agora = this.relogio.agora();

    const pedidoId = await this.db.transaction(async (tx) => {
      const indisponiveis: string[] = [];
      // Ordem fixa por id evita deadlock entre dois checkouts com os mesmos produtos
      for (const item of [...itens].sort((a, b) => a.produtoId - b.produtoId)) {
        const reservado = await tx
          .update(produto)
          .set({ estoqueReservado: sql`${produto.estoqueReservado} + ${item.quantidade}` })
          .where(and(eq(produto.id, item.produtoId), eq(produto.ativo, true), sql`${produto.estoque} - ${produto.estoqueReservado} >= ${item.quantidade}`))
          .returning({ id: produto.id });
        if (!reservado.length) indisponiveis.push(item.nome);
      }
      if (indisponiveis.length) {
        throw new Conflito('Alguns itens ficaram indisponíveis enquanto você finalizava a compra.', { indisponiveis });
      }
      const [novo] = await tx
        .insert(pedido)
        .values({
          usuarioId: u.id,
          status: StatusPedido.AguardandoPagamento,
          chaveIdempotencia: dados.chaveIdempotencia,
          subtotal: paraDecimal(totais.subtotal),
          valorFrete: paraDecimal(totais.frete),
          desconto: paraDecimal(totais.desconto),
          total: paraDecimal(totais.total),
          freteServicoId: opcao.servicoId,
          freteDescricao: opcao.descricao.slice(0, 150),
          fretePrazoDias: opcao.prazoDias,
          entregaDestinatario: end.destinatario,
          entregaCep: end.cep,
          entregaLogradouro: end.logradouro,
          entregaNumero: end.numero,
          entregaComplemento: end.complemento,
          entregaBairro: end.bairro,
          entregaCidade: end.cidade,
          entregaUf: end.uf,
          expiraEm: new Date(agora.getTime() + PRAZO_ESCOLHA_PAGAMENTO_MIN * 60_000),
        })
        .returning({ id: pedido.id });
      await tx.insert(pedidoItem).values(
        itens.map((i) => ({
          pedidoId: novo.id,
          produtoId: i.produtoId,
          nomeProduto: i.nome,
          sku: i.sku,
          precoUnitario: paraDecimal(i.precoUnitario),
          quantidade: i.quantidade,
          total: paraDecimal(i.precoUnitario * i.quantidade),
        })),
      );
      await tx.insert(pedidoHistorico).values({ pedidoId: novo.id, statusAnterior: null, statusNovo: StatusPedido.AguardandoPagamento, autor: `cliente:${u.id}` });
      await this.carrinho.esvaziar(u.id, itens.map((i) => i.produtoId), tx);
      return novo.id;
    });
    this.logger.log(`Pedido ${pedidoId} criado (cliente ${u.id}, total ${paraDecimal(totais.total)})`);
    await this.email.pedido(u.email, u.nome, pedidoId, 'recebemos seu pedido', 'Seu pedido foi registrado e os itens estão reservados. Conclua o pagamento para confirmarmos a compra.');
    return { id: pedidoId, repetido: false };
  }

  /** RF14 — só os pedidos do próprio cliente. */
  async listar(usuarioId: number) {
    const linhas = await this.db
      .select({ id: pedido.id, status: pedido.status, total: pedido.total, criadoEm: pedido.criadoEm, itens: sql<number>`(SELECT coalesce(sum(quantidade),0)::int FROM pedido_item WHERE pedido_id = ${pedido.id})` })
      .from(pedido)
      .where(eq(pedido.usuarioId, usuarioId))
      .orderBy(desc(pedido.id))
      .limit(100);
    return linhas.map((p) => ({ ...p, total: paraReais(paraCentavos(p.total)), statusDescricao: DESCRICAO_STATUS_PEDIDO[p.status as StatusPedido] }));
  }

  /** Detalhe; pedido de outro cliente → 404 (IDOR). `usuarioId` null = visão do administrador. */
  async detalhe(id: number, usuarioId: number | null) {
    const [p] = await this.db
      .select()
      .from(pedido)
      .where(usuarioId === null ? eq(pedido.id, id) : and(eq(pedido.id, id), eq(pedido.usuarioId, usuarioId)));
    if (!p) throw new NaoEncontrado('Pedido não encontrado.');
    const itens = await this.db.select().from(pedidoItem).where(eq(pedidoItem.pedidoId, id)).orderBy(asc(pedidoItem.id));
    const historico = await this.db.select().from(pedidoHistorico).where(eq(pedidoHistorico.pedidoId, id)).orderBy(asc(pedidoHistorico.id));
    const [pag] = await this.db.select().from(pagamento).where(eq(pagamento.pedidoId, id)).orderBy(desc(pagamento.id)).limit(1);
    const capas = await this.catalogo.capas(itens.map((i) => i.produtoId));
    const status = p.status as StatusPedido;
    return {
      id: p.id,
      status,
      statusDescricao: DESCRICAO_STATUS_PEDIDO[status],
      criadoEm: p.criadoEm,
      expiraEm: p.expiraEm,
      subtotal: paraReais(paraCentavos(p.subtotal)),
      frete: paraReais(paraCentavos(p.valorFrete)),
      desconto: paraReais(paraCentavos(p.desconto)),
      total: paraReais(paraCentavos(p.total)),
      freteDescricao: p.freteDescricao,
      fretePrazoDias: p.fretePrazoDias,
      codigoRastreio: p.codigoRastreio,
      motivoCancelamento: p.motivoCancelamento,
      entrega: {
        destinatario: p.entregaDestinatario,
        cep: p.entregaCep,
        logradouro: p.entregaLogradouro,
        numero: p.entregaNumero,
        complemento: p.entregaComplemento,
        bairro: p.entregaBairro,
        cidade: p.entregaCidade,
        uf: p.entregaUf,
      },
      itens: itens.map((i) => ({
        produtoId: i.produtoId,
        nome: i.nomeProduto,
        sku: i.sku,
        quantidade: i.quantidade,
        precoUnitario: paraReais(paraCentavos(i.precoUnitario)),
        total: paraReais(paraCentavos(i.total)),
        imagem: capas.get(i.produtoId) ?? null,
      })),
      historico: historico.map((h) => ({
        status: h.statusNovo,
        descricao: DESCRICAO_STATUS_PEDIDO[h.statusNovo as StatusPedido],
        observacao: h.observacao,
        criadoEm: h.criadoEm,
        ...(usuarioId === null ? { autor: h.autor } : {}),
      })),
      pagamento: pag ? this.resumoPagamento(pag) : null,
      podeCancelar: clientePodeCancelar(status),
      podePagar: status === StatusPedido.AguardandoPagamento,
      ...(usuarioId === null ? { usuarioId: p.usuarioId } : {}),
    };
  }

  resumoPagamento(pag: typeof pagamento.$inferSelect) {
    return {
      id: pag.id,
      metodo: pag.metodo as MetodoPagamento,
      status: pag.status as StatusPagamento,
      statusDetalhe: pag.statusDetalhe,
      valor: paraReais(paraCentavos(pag.valor)),
      parcelas: pag.parcelas,
      bandeira: pag.bandeira,
      ultimosDigitos: pag.ultimosDigitos,
      pixQrCode: pag.pixQrCode,
      pixQrCodeBase64: pag.pixQrCodeBase64,
      boletoUrl: pag.boletoUrl,
      boletoLinhaDigitavel: pag.boletoLinhaDigitavel,
      expiraEm: pag.expiraEm,
    };
  }

  /**
   * RF16 — cancela; se houver pagamento aprovado, pede o estorno ao Mercado Pago antes.
   * `usuarioId` preenchido = cancelamento pelo cliente (só até "Pago").
   */
  async cancelar(id: number, autor: string, motivo: string, usuarioId: number | null) {
    const [p] = await this.db
      .select()
      .from(pedido)
      .where(usuarioId === null ? eq(pedido.id, id) : and(eq(pedido.id, id), eq(pedido.usuarioId, usuarioId)));
    if (!p) throw new NaoEncontrado('Pedido não encontrado.');
    const status = p.status as StatusPedido;
    if (usuarioId !== null && !clientePodeCancelar(status)) throw new Conflito('Este pedido não pode mais ser cancelado pelo site. Fale com a loja.');

    const aprovados = await this.db
      .select()
      .from(pagamento)
      .where(and(eq(pagamento.pedidoId, id), eq(pagamento.status, StatusPagamento.Aprovado)));
    for (const pag of aprovados) await this.estornar(pag, motivo);

    await this.estado.transitar(id, { para: StatusPedido.Cancelado, autor, observacao: motivo.slice(0, 300) });
    return this.detalhe(id, usuarioId);
  }

  async estornar(pag: typeof pagamento.$inferSelect, motivo: string) {
    if (!pag.gatewayId) return;
    try {
      await this.gateway.estornar(pag.gatewayId, randomUUID());
    } catch (erro) {
      this.logger.error({ err: erro }, `Falha ao estornar o pagamento ${pag.id}`);
      throw new ErroNegocio('Não foi possível solicitar o estorno agora. Tente de novo em alguns minutos.', HttpStatus.BAD_GATEWAY);
    }
    await this.db
      .update(pagamento)
      .set({ status: StatusPagamento.Estornado, statusGateway: 'refunded', statusDetalhe: motivo.slice(0, 100), alteradoEm: this.relogio.agora() })
      .where(eq(pagamento.id, pag.id));
    this.logger.log(`Estorno solicitado: pagamento ${pag.id} (${pag.gatewayId})`);
  }
}
