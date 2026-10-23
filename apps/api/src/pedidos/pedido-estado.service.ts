import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { Conflito, NaoEncontrado } from '../comum/erros';
import { Relogio } from '../comum/relogio';
import { Banco, BANCO, Transacao } from '../db/db';
import { pedido, pedidoHistorico, pedidoItem, produto, usuario } from '../db/schema';
import { DESCRICAO_STATUS_PEDIDO, podeTransitar, StatusPedido } from '../dominio/status';
import { EmailService } from '../email/email.service';

export interface Transicao {
  para: StatusPedido;
  autor: string;
  observacao?: string;
  codigoRastreio?: string;
  /** Só aplica se o pedido estiver num destes status (proteção contra corrida). */
  somenteSe?: StatusPedido[];
}

const TEXTOS_EMAIL: Partial<Record<StatusPedido, [string, string]>> = {
  [StatusPedido.Pago]: ['pagamento aprovado', 'Recebemos o pagamento. Agora vamos separar seu pedido.'],
  [StatusPedido.Enviado]: ['pedido enviado', 'Seu pedido foi enviado. Acompanhe pelo código de rastreio na página do pedido.'],
  [StatusPedido.Entregue]: ['pedido entregue', 'Seu pedido foi entregue. Obrigado pela compra!'],
  [StatusPedido.Cancelado]: ['pedido cancelado', 'Seu pedido foi cancelado. Se houve pagamento, o estorno já foi solicitado.'],
};

/**
 * Máquina de estados do pedido (RN07) com o efeito no estoque (RN02):
 *   Pago      → baixa o estoque e libera a reserva
 *   Cancelado → devolve a reserva (não pago) ou o estoque (já baixado)
 * Cada transição trava a linha (SELECT ... FOR UPDATE), incrementa a versão e grava o histórico (RNF08).
 */
@Injectable()
export class PedidoEstadoService {
  private readonly logger = new Logger('Pedido');

  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly relogio: Relogio,
    private readonly email: EmailService,
  ) {}

  /** Executa a transição; devolve false (sem erro) se `somenteSe` não bate — útil para webhook repetido. */
  async transitar(pedidoId: number, t: Transicao, txExterna?: Transacao): Promise<boolean> {
    const executar = async (tx: Transacao) => {
      const [atual] = await tx.select().from(pedido).where(eq(pedido.id, pedidoId)).for('update');
      if (!atual) throw new NaoEncontrado('Pedido não encontrado.');
      const de = atual.status as StatusPedido;
      if (t.somenteSe && !t.somenteSe.includes(de)) return null;
      if (de === t.para) return null;
      if (!podeTransitar(de, t.para)) {
        throw new Conflito(`Não é possível mudar de "${DESCRICAO_STATUS_PEDIDO[de]}" para "${DESCRICAO_STATUS_PEDIDO[t.para]}".`);
      }
      const agora = this.relogio.agora();
      const itens = await tx.select().from(pedidoItem).where(eq(pedidoItem.pedidoId, pedidoId));
      const estoqueJaBaixado = [StatusPedido.Pago, StatusPedido.EmSeparacao].includes(de);

      for (const item of itens) {
        if (t.para === StatusPedido.Pago) {
          await tx
            .update(produto)
            .set({ estoque: sql`${produto.estoque} - ${item.quantidade}`, estoqueReservado: sql`${produto.estoqueReservado} - ${item.quantidade}` })
            .where(eq(produto.id, item.produtoId));
        } else if (t.para === StatusPedido.Cancelado) {
          await tx
            .update(produto)
            .set(
              estoqueJaBaixado
                ? { estoque: sql`${produto.estoque} + ${item.quantidade}` }
                : { estoqueReservado: sql`GREATEST(0, ${produto.estoqueReservado} - ${item.quantidade})` },
            )
            .where(eq(produto.id, item.produtoId));
        }
      }

      await tx
        .update(pedido)
        .set({
          status: t.para,
          versao: atual.versao + 1,
          alteradoEm: agora,
          ...(t.para === StatusPedido.Pago ? { pagoEm: agora, expiraEm: null } : {}),
          ...(t.para === StatusPedido.Enviado ? { enviadoEm: agora, codigoRastreio: t.codigoRastreio ?? atual.codigoRastreio } : {}),
          ...(t.para === StatusPedido.Entregue ? { entregueEm: agora } : {}),
          ...(t.para === StatusPedido.Cancelado ? { canceladoEm: agora, motivoCancelamento: t.observacao ?? null, expiraEm: null } : {}),
        })
        .where(eq(pedido.id, pedidoId));
      await tx.insert(pedidoHistorico).values({ pedidoId, statusAnterior: de, statusNovo: t.para, observacao: t.observacao ?? null, autor: t.autor });
      this.logger.log(`Pedido ${pedidoId}: ${DESCRICAO_STATUS_PEDIDO[de]} → ${DESCRICAO_STATUS_PEDIDO[t.para]} (${t.autor})`);
      return atual.usuarioId;
    };

    const usuarioId = txExterna ? await executar(txExterna) : await this.db.transaction(executar);
    if (usuarioId === null) return false;
    if (!txExterna) await this.avisarCliente(pedidoId, usuarioId, t.para);
    return true;
  }

  async avisarCliente(pedidoId: number, usuarioId: number, status: StatusPedido) {
    const texto = TEXTOS_EMAIL[status];
    if (!texto) return;
    const [u] = await this.db.select({ email: usuario.email, nome: usuario.nome, anonimizado: usuario.anonimizado }).from(usuario).where(eq(usuario.id, usuarioId));
    if (u && !u.anonimizado) await this.email.pedido(u.email, u.nome, pedidoId, texto[0], texto[1]);
  }
}
