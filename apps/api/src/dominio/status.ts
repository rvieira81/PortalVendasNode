export enum StatusPedido {
  AguardandoPagamento = 1,
  PagamentoEmAnalise = 2,
  Pago = 3,
  EmSeparacao = 4,
  Enviado = 5,
  Entregue = 6,
  Cancelado = 9,
}

export const DESCRICAO_STATUS_PEDIDO: Record<StatusPedido, string> = {
  [StatusPedido.AguardandoPagamento]: 'Aguardando pagamento',
  [StatusPedido.PagamentoEmAnalise]: 'Pagamento em análise',
  [StatusPedido.Pago]: 'Pago',
  [StatusPedido.EmSeparacao]: 'Em separação',
  [StatusPedido.Enviado]: 'Enviado',
  [StatusPedido.Entregue]: 'Entregue',
  [StatusPedido.Cancelado]: 'Cancelado',
};

/** RN07 — únicas transições permitidas. */
const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  [StatusPedido.AguardandoPagamento]: [StatusPedido.PagamentoEmAnalise, StatusPedido.Pago, StatusPedido.Cancelado],
  [StatusPedido.PagamentoEmAnalise]: [StatusPedido.Pago, StatusPedido.AguardandoPagamento, StatusPedido.Cancelado],
  [StatusPedido.Pago]: [StatusPedido.EmSeparacao, StatusPedido.Cancelado],
  [StatusPedido.EmSeparacao]: [StatusPedido.Enviado, StatusPedido.Cancelado],
  [StatusPedido.Enviado]: [StatusPedido.Entregue],
  [StatusPedido.Entregue]: [],
  [StatusPedido.Cancelado]: [],
};

export function podeTransitar(de: StatusPedido, para: StatusPedido): boolean {
  return TRANSICOES[de]?.includes(para) ?? false;
}

/** RF16 — o cliente cancela enquanto o pedido não entrou em separação. */
export function clientePodeCancelar(status: StatusPedido): boolean {
  return [StatusPedido.AguardandoPagamento, StatusPedido.PagamentoEmAnalise, StatusPedido.Pago].includes(status);
}

export enum MetodoPagamento {
  Pix = 1,
  Cartao = 2,
  Boleto = 3,
}

export enum StatusPagamento {
  Pendente = 1,
  EmAnalise = 2,
  Aprovado = 3,
  Recusado = 4,
  Cancelado = 5,
  Estornado = 6,
  Contestado = 7,
}

/** Status do Mercado Pago → status interno. */
export function statusPagamentoDoGateway(status: string): StatusPagamento {
  switch (status) {
    case 'approved':
      return StatusPagamento.Aprovado;
    case 'authorized':
    case 'in_process':
      return StatusPagamento.EmAnalise;
    case 'pending':
    case 'in_mediation':
      return StatusPagamento.Pendente;
    case 'rejected':
      return StatusPagamento.Recusado;
    case 'cancelled':
      return StatusPagamento.Cancelado;
    case 'refunded':
      return StatusPagamento.Estornado;
    case 'charged_back':
      return StatusPagamento.Contestado;
    default:
      return StatusPagamento.Pendente;
  }
}

const MOTIVOS_RECUSA: Record<string, string> = {
  cc_rejected_insufficient_amount: 'Saldo ou limite insuficiente.',
  cc_rejected_bad_filled_security_code: 'Código de segurança incorreto.',
  cc_rejected_bad_filled_date: 'Data de validade incorreta.',
  cc_rejected_bad_filled_card_number: 'Número do cartão incorreto.',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão.',
  cc_rejected_call_for_authorize: 'O banco pediu autorização: ligue para a central do cartão e tente de novo.',
  cc_rejected_card_disabled: 'Cartão não habilitado: ligue para a central do cartão.',
  cc_rejected_duplicated_payment: 'Pagamento duplicado: você já pagou este valor.',
  cc_rejected_high_risk: 'Pagamento recusado pela análise de segurança. Tente outro cartão ou Pix.',
  cc_rejected_max_attempts: 'Limite de tentativas atingido. Use outro cartão.',
  cc_rejected_blacklist: 'Pagamento não autorizado. Tente outra forma de pagamento.',
};

export function motivoRecusaAmigavel(detalhe: string | null | undefined): string {
  return (detalhe && MOTIVOS_RECUSA[detalhe]) || 'Pagamento recusado. Tente outro cartão ou outra forma de pagamento.';
}
