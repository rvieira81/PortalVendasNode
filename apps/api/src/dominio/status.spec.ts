import { clientePodeCancelar, motivoRecusaAmigavel, podeTransitar, StatusPagamento, statusPagamentoDoGateway, StatusPedido as S } from './status';

describe('máquina de estados do pedido (RN07)', () => {
  const permitidas: [S, S][] = [
    [S.AguardandoPagamento, S.Pago],
    [S.AguardandoPagamento, S.PagamentoEmAnalise],
    [S.AguardandoPagamento, S.Cancelado],
    [S.PagamentoEmAnalise, S.Pago],
    [S.PagamentoEmAnalise, S.AguardandoPagamento],
    [S.Pago, S.EmSeparacao],
    [S.Pago, S.Cancelado],
    [S.EmSeparacao, S.Enviado],
    [S.EmSeparacao, S.Cancelado],
    [S.Enviado, S.Entregue],
  ];
  const proibidas: [S, S][] = [
    [S.AguardandoPagamento, S.Enviado],
    [S.AguardandoPagamento, S.EmSeparacao],
    [S.Pago, S.Entregue],
    [S.Enviado, S.Cancelado],
    [S.Entregue, S.Cancelado],
    [S.Cancelado, S.Pago],
    [S.Cancelado, S.AguardandoPagamento],
  ];
  it.each(permitidas)('permite %i → %i', (de, para) => expect(podeTransitar(de, para)).toBe(true));
  it.each(proibidas)('proíbe %i → %i', (de, para) => expect(podeTransitar(de, para)).toBe(false));

  it('cliente cancela só até "Pago" (RF16)', () => {
    expect(clientePodeCancelar(S.AguardandoPagamento)).toBe(true);
    expect(clientePodeCancelar(S.Pago)).toBe(true);
    expect(clientePodeCancelar(S.EmSeparacao)).toBe(false);
    expect(clientePodeCancelar(S.Enviado)).toBe(false);
  });
});

describe('status do Mercado Pago', () => {
  it.each([
    ['approved', StatusPagamento.Aprovado],
    ['in_process', StatusPagamento.EmAnalise],
    ['pending', StatusPagamento.Pendente],
    ['rejected', StatusPagamento.Recusado],
    ['cancelled', StatusPagamento.Cancelado],
    ['refunded', StatusPagamento.Estornado],
    ['charged_back', StatusPagamento.Contestado],
    ['desconhecido', StatusPagamento.Pendente],
  ])('%s → %i', (gateway, interno) => expect(statusPagamentoDoGateway(gateway)).toBe(interno));

  it('traduz o motivo da recusa (RF11)', () => {
    expect(motivoRecusaAmigavel('cc_rejected_insufficient_amount')).toMatch(/insuficiente/);
    expect(motivoRecusaAmigavel('codigo_novo')).toMatch(/recusado/);
  });
});
