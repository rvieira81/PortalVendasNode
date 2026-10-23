import { Ambiente, criarAmbiente, estoque, IDS, notificar, novoCliente, novoPedido, prepararBanco } from './apoio/ambiente';

describe('Pagamentos (RF10–RF13, RN04, RN06, RN08)', () => {
  let amb: Ambiente;
  beforeAll(async () => (amb = await criarAmbiente()));
  beforeEach(() => prepararBanco(amb));
  afterAll(() => amb.fechar());

  async function pedidoComPix() {
    const c = await novoCliente(amb);
    const p = await novoPedido(c, [[IDS.fone, 2]]);
    const r = await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'pix' });
    return { c, p, r, gatewayId: amb.gateway.ultimoId() };
  }

  it('expõe só a chave pública', async () => {
    const r = await (await amb.cliente()).get('/pagamentos/config');
    expect(r.body).toEqual({ publicKey: 'TEST-publica', parcelasMaximas: 12, parcelaMinima: 10, configurado: true });
  });

  it('gera Pix com validade de 30 min e o pedido passa a vencer junto', async () => {
    const { r, p } = await pedidoComPix();
    expect(r.status).toBe(200);
    expect(r.body.pagamento).toMatchObject({ metodo: 1, status: 1, pixQrCode: expect.stringContaining('PIX') });
    const minutos = (new Date(r.body.pagamento.expiraEm).getTime() - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(29);
    expect(minutos).toBeLessThan(31);
    expect(amb.gateway.criados[0]).toMatchObject({ pedidoId: p.id, valor: 42470, metodo: 'pix' });
  });

  it('reaproveita o Pix ainda válido em vez de gerar outro', async () => {
    const { c, p } = await pedidoComPix();
    await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'pix' });
    expect(amb.gateway.criados).toHaveLength(1);
  });

  it('webhook assinado confirma: pedido "Pago" e estoque baixado (RF13)', async () => {
    const { c, p, gatewayId } = await pedidoComPix();
    amb.gateway.definirStatus(gatewayId, 'approved');
    const r = await notificar(amb, gatewayId);
    expect(r.status).toBe(200);
    const d = (await c.nav.get(`/pedidos/${p.id}`)).body;
    expect(d.status).toBe(3);
    expect(d.pagamento.status).toBe(3);
    expect(await estoque(amb, IDS.fone)).toEqual({ estoque: 3, reservado: 0 });
    expect(amb.email.enviados.some((m) => m.assunto.includes('pagamento aprovado'))).toBe(true);
  });

  it('webhook com assinatura inválida é rejeitado e registrado', async () => {
    const { c, p, gatewayId } = await pedidoComPix();
    amb.gateway.definirStatus(gatewayId, 'approved');
    const r = await notificar(amb, gatewayId, { segredo: 'segredo-errado' });
    expect(r.status).toBe(401);
    expect((await c.nav.get(`/pedidos/${p.id}`)).body.status).toBe(1);
    const { rows } = await amb.pool.query('SELECT assinatura_valida FROM notificacao_gateway');
    expect(rows).toEqual([{ assinatura_valida: false }]);
  });

  it('não confia no corpo: status vem da consulta à API (RN08)', async () => {
    const { c, p, gatewayId } = await pedidoComPix();
    // Gateway ainda "pending": notificação dizendo "approved" no corpo não muda nada
    await notificar(amb, gatewayId);
    expect((await c.nav.get(`/pedidos/${p.id}`)).body.status).toBe(1);
  });

  it('a mesma notificação duas vezes é processada uma vez só', async () => {
    const { gatewayId } = await pedidoComPix();
    amb.gateway.definirStatus(gatewayId, 'approved');
    await notificar(amb, gatewayId, { requestId: 'req-repetida' });
    await notificar(amb, gatewayId, { requestId: 'req-repetida' });
    const { rows } = await amb.pool.query('SELECT count(*)::int AS n FROM notificacao_gateway');
    expect(rows[0].n).toBe(1);
    const h = await amb.pool.query('SELECT count(*)::int AS n FROM pedido_historico WHERE status_novo = 3');
    expect(h.rows[0].n).toBe(1);
  });

  it('cartão aprovado na hora, com parcelas válidas (RF11, RN06)', async () => {
    const c = await novoCliente(amb);
    const p = await novoPedido(c, [[IDS.fone, 1]]);
    expect((await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'cartao', cartao: { token: 'tok_1234567890', parcelas: 13, paymentMethodId: 'visa' } })).status).toBe(400);
    amb.gateway.proximo = { status: 'approved', detalhe: 'accredited' };
    const r = await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'cartao', cartao: { token: 'tok_1234567890', parcelas: 3, paymentMethodId: 'visa' } });
    expect(r.body).toMatchObject({ status: 3, pagamento: { metodo: 2, status: 3, parcelas: 3, ultimosDigitos: '4242', bandeira: 'visa' } });
  });

  it('parcela mínima de R$ 10 limita o número de parcelas', async () => {
    const c = await novoCliente(amb);
    const p = await novoPedido(c, [[IDS.cabo, 1]], 'me-1'); // 29,90 + 24,90 = 54,80 → até 5x
    const r = await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'cartao', cartao: { token: 'tok_1234567890', parcelas: 6, paymentMethodId: 'visa' } });
    expect(r.status).toBe(400);
    expect(r.body.mensagem).toMatch(/1 a 5/);
  });

  it('cartão recusado mostra o motivo e permite tentar de novo', async () => {
    const c = await novoCliente(amb);
    const p = await novoPedido(c);
    amb.gateway.proximo = { status: 'rejected', detalhe: 'cc_rejected_insufficient_amount' };
    const r = await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'cartao', cartao: { token: 'tok_1234567890', parcelas: 1, paymentMethodId: 'visa' } });
    expect(r.body.status).toBe(1);
    expect(r.body.recusa).toMatch(/insuficiente/);
    amb.gateway.proximo = { status: 'approved' };
    const r2 = await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'cartao', cartao: { token: 'tok_0987654321', parcelas: 1, paymentMethodId: 'master' } });
    expect(r2.body.status).toBe(3);
  });

  it('pagamento em análise e depois aprovado', async () => {
    const c = await novoCliente(amb);
    const p = await novoPedido(c);
    amb.gateway.proximo = { status: 'in_process', detalhe: 'pending_review_manual' };
    const r = await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'cartao', cartao: { token: 'tok_1234567890', parcelas: 1, paymentMethodId: 'visa' } });
    expect(r.body.status).toBe(2);
    amb.gateway.definirStatus(amb.gateway.ultimoId(), 'approved');
    await notificar(amb, amb.gateway.ultimoId());
    expect((await c.nav.get(`/pedidos/${p.id}/status`)).body.status).toBe(3);
  });

  it('boleto vence em 3 dias úteis', async () => {
    const c = await novoCliente(amb);
    const p = await novoPedido(c);
    const r = await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'boleto' });
    expect(r.body.pagamento).toMatchObject({ metodo: 3, boletoLinhaDigitavel: expect.any(String), boletoUrl: expect.stringContaining('boleto') });
    const dias = (new Date(r.body.pagamento.expiraEm).getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(2.9);
    expect(dias).toBeLessThan(6);
  });

  it('falha no Mercado Pago devolve 502 com mensagem amigável', async () => {
    const c = await novoCliente(amb);
    const p = await novoPedido(c);
    amb.gateway.falharCriacao = true;
    const r = await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'pix' });
    expect(r.status).toBe(502);
    expect(r.body.mensagem).toMatch(/outra forma/);
  });

  it('segunda aprovação do mesmo pedido é estornada automaticamente', async () => {
    const c = await novoCliente(amb);
    const p = await novoPedido(c);
    await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'pix' });
    const pix = amb.gateway.ultimoId();
    amb.gateway.proximo = { status: 'approved' };
    await amb.pool.query(`UPDATE pagamento SET status = 1`); // cartão aprovado enquanto o Pix seguia aberto
    await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'cartao', cartao: { token: 'tok_1234567890', parcelas: 1, paymentMethodId: 'visa' } });
    amb.gateway.definirStatus(pix, 'approved');
    await notificar(amb, pix);
    expect(amb.gateway.estornos).toEqual([pix]);
    expect((await c.nav.get(`/pedidos/${p.id}`)).body.status).toBe(3);
  });

  it('job expira o Pix vencido, cancela e libera o estoque (RN04)', async () => {
    const { c, p } = await pedidoComPix();
    amb.relogio.avancarMinutos(31);
    const r = await amb.manutencao.executar();
    expect(r).toMatchObject({ expirados: 1 });
    expect((await c.nav.get(`/pedidos/${p.id}`)).body).toMatchObject({ status: 9, motivoCancelamento: 'Prazo de pagamento expirado' });
    expect(await estoque(amb, IDS.fone)).toEqual({ estoque: 5, reservado: 0 });
  });

  it('job consulta antes de expirar: Pix pago no último minuto não é cancelado', async () => {
    const { c, p, gatewayId } = await pedidoComPix();
    amb.gateway.definirStatus(gatewayId, 'approved');
    amb.relogio.avancarMinutos(31);
    await amb.manutencao.executar();
    expect((await c.nav.get(`/pedidos/${p.id}`)).body.status).toBe(3);
  });

  it('conciliação confirma pagamento cujo webhook se perdeu', async () => {
    const { c, p, gatewayId } = await pedidoComPix();
    amb.gateway.definirStatus(gatewayId, 'approved');
    amb.relogio.avancarMinutos(3);
    const r = await amb.manutencao.executar();
    expect(r).toMatchObject({ conciliados: 1 });
    expect((await c.nav.get(`/pedidos/${p.id}`)).body.status).toBe(3);
  });

  it('aprovação que chega depois do cancelamento é estornada', async () => {
    const { c, p, gatewayId } = await pedidoComPix();
    await c.nav.post(`/pedidos/${p.id}/cancelar`);
    amb.gateway.definirStatus(gatewayId, 'approved');
    await notificar(amb, gatewayId);
    expect(amb.gateway.estornos).toEqual([gatewayId]);
    expect((await c.nav.get(`/pedidos/${p.id}`)).body.status).toBe(9);
  });

  it('cliente cancela pedido pago: estorno + estoque devolvido (RF16)', async () => {
    const { c, p, gatewayId } = await pedidoComPix();
    amb.gateway.definirStatus(gatewayId, 'approved');
    await notificar(amb, gatewayId);
    const r = await c.nav.post(`/pedidos/${p.id}/cancelar`);
    expect(r.body.status).toBe(9);
    expect(amb.gateway.estornos).toEqual([gatewayId]);
    expect(await estoque(amb, IDS.fone)).toEqual({ estoque: 5, reservado: 0 });
  });

  it('valor aprovado diferente do pedido é estornado e o pedido não é pago', async () => {
    const { c, p, gatewayId } = await pedidoComPix();
    amb.gateway.definirStatus(gatewayId, 'approved', undefined, 100);
    await notificar(amb, gatewayId);
    expect(amb.gateway.estornos).toEqual([gatewayId]);
    expect((await c.nav.get(`/pedidos/${p.id}`)).body.status).toBe(1);
  });
});
