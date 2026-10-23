import { Ambiente, criarAmbiente, estoque, IDS, notificar, novoAdmin, novoCliente, novoPedido, prepararBanco } from './apoio/ambiente';

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

describe('Painel administrativo (RF17–RF20)', () => {
  let amb: Ambiente;
  beforeAll(async () => (amb = await criarAmbiente()));
  beforeEach(() => prepararBanco(amb));
  afterAll(() => amb.fechar());

  const produto = (extra: object = {}) => ({ categoriaId: 1, sku: 'NOVO-1', nome: 'Teclado Mecânico', descricao: 'ABNT2', preco: 299.9, precoDe: null, estoque: 7, pesoKg: 0.9, alturaCm: 5, larguraCm: 15, comprimentoCm: 45, ativo: true, ...extra });

  it('cadastra produto com slug gerado e aparece na loja', async () => {
    const { nav } = await novoAdmin(amb);
    const r = await nav.post('/admin/produtos', produto());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ slug: 'teclado-mecanico', preco: 299.9, criadoPor: expect.stringContaining('admin-') });
    expect((await nav.get('/produtos/teclado-mecanico')).status).toBe(200);
  });

  it('recusa SKU repetido, peso/medidas zerados e preço "de" menor', async () => {
    const { nav } = await novoAdmin(amb);
    expect((await nav.post('/admin/produtos', produto({ sku: 'FONE' }))).status).toBe(409);
    const r = await nav.post('/admin/produtos', produto({ pesoKg: 0, alturaCm: 0 }));
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.campos)).toEqual(expect.arrayContaining(['pesoKg', 'alturaCm']));
    expect((await nav.post('/admin/produtos', produto({ precoDe: 100 }))).status).toBe(422);
  });

  it('não deixa o estoque abaixo do reservado', async () => {
    const c = await novoCliente(amb);
    await novoPedido(c, [[IDS.fone, 3]]);
    const { nav } = await novoAdmin(amb);
    const atual = (await nav.get(`/admin/produtos/${IDS.fone}`)).body;
    const r = await nav.put(`/admin/produtos/${IDS.fone}`, { ...produto({ sku: 'FONE', nome: atual.nome }), estoque: 2 });
    expect(r.status).toBe(422);
  });

  it('aceita só imagens reais de até 2 MB', async () => {
    const { nav } = await novoAdmin(amb);
    const ok = await nav.agente.post(`/api/admin/produtos/${IDS.cabo}/imagens`).set('X-CSRF-Token', nav.csrf).attach('imagens', PNG, 'foto.png');
    expect(ok.status).toBe(201);
    expect(ok.body.imagens[0].url).toMatch(/^\/api\/imagens\/[a-f0-9]{32}\.png$/);
    const falsa = await nav.agente.post(`/api/admin/produtos/${IDS.cabo}/imagens`).set('X-CSRF-Token', nav.csrf).attach('imagens', Buffer.from('<?php system($_GET["c"]); ?>'), 'foto.png');
    expect(falsa.status).toBe(422);
    const grande = await nav.agente.post(`/api/admin/produtos/${IDS.cabo}/imagens`).set('X-CSRF-Token', nav.csrf).attach('imagens', Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]), 'grande.png');
    expect(grande.status).toBe(413);
    const servida = await nav.agente.get(ok.body.imagens[0].url);
    expect(servida.status).toBe(200);
  });

  it('produto com vendas é só desativado (RF17)', async () => {
    const c = await novoCliente(amb);
    await novoPedido(c, [[IDS.cabo, 1]]);
    const { nav } = await novoAdmin(amb);
    const r = await nav.delete(`/admin/produtos/${IDS.cabo}`);
    expect(r.body.desativado).toBe(true);
    expect((await nav.get('/produtos/cabo')).status).toBe(404);
    const semVenda = await nav.delete(`/admin/produtos/${IDS.cafe}`);
    expect(semVenda.body.desativado).toBe(false);
  });

  it('segue o fluxo de status e registra quem mudou (RF18)', async () => {
    const c = await novoCliente(amb);
    const p = await novoPedido(c);
    const { nav, email } = await novoAdmin(amb);
    expect((await nav.post(`/admin/pedidos/${p.id}/status`, { status: 5, codigoRastreio: 'AA1' })).status).toBe(409);
    await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'pix' });
    amb.gateway.definirStatus(amb.gateway.ultimoId(), 'approved');
    await notificar(amb, amb.gateway.ultimoId());
    expect((await nav.post(`/admin/pedidos/${p.id}/status`, { status: 4 })).status).toBe(200);
    expect((await nav.post(`/admin/pedidos/${p.id}/status`, { status: 5 })).status).toBe(422);
    const enviado = await nav.post(`/admin/pedidos/${p.id}/status`, { status: 5, codigoRastreio: 'BR123456789BR' });
    expect(enviado.body).toMatchObject({ status: 5, codigoRastreio: 'BR123456789BR' });
    expect(enviado.body.historico.at(-1).autor).toBe(email);
    expect((await c.nav.post(`/pedidos/${p.id}/cancelar`)).status).toBe(409);
    await nav.post(`/admin/pedidos/${p.id}/status`, { status: 6 });
    const d = (await c.nav.get(`/pedidos/${p.id}`)).body;
    expect(d.historico.map((h: { status: number }) => h.status)).toEqual([1, 3, 4, 5, 6]);
    expect(d.historico[0].autor).toBeUndefined(); // cliente não vê quem alterou
  });

  it('cancela pedido em separação com estorno e devolve o estoque', async () => {
    const c = await novoCliente(amb);
    const p = await novoPedido(c, [[IDS.fone, 2]]);
    await c.nav.post(`/pedidos/${p.id}/pagamento`, { metodo: 'pix' });
    amb.gateway.definirStatus(amb.gateway.ultimoId(), 'approved');
    await notificar(amb, amb.gateway.ultimoId());
    const { nav } = await novoAdmin(amb);
    await nav.post(`/admin/pedidos/${p.id}/status`, { status: 4 });
    const r = await nav.post(`/admin/pedidos/${p.id}/cancelar`, { motivo: 'Produto com defeito no estoque' });
    expect(r.body.status).toBe(9);
    expect(amb.gateway.estornos).toHaveLength(1);
    expect(await estoque(amb, IDS.fone)).toEqual({ estoque: 5, reservado: 0 });
  });

  it('filtra pedidos e mostra o painel de vendas (RF20)', async () => {
    const c = await novoCliente(amb);
    const p1 = await novoPedido(c, [[IDS.fone, 1]]);
    await c.nav.post(`/pedidos/${p1.id}/pagamento`, { metodo: 'pix' });
    amb.gateway.definirStatus(amb.gateway.ultimoId(), 'approved');
    await notificar(amb, amb.gateway.ultimoId());
    await novoPedido(c, [[IDS.cabo, 2]]);
    const { nav } = await novoAdmin(amb);
    expect((await nav.get('/admin/pedidos?status=3')).body.total).toBe(1);
    expect((await nav.get(`/admin/pedidos?busca=${c.email}`)).body.total).toBe(2);
    const painel = (await nav.get('/admin/painel')).body;
    expect(painel).toMatchObject({ faturamento: 224.8, pedidos: 1, ticketMedio: 224.8 });
    expect(painel.maisVendidos[0]).toMatchObject({ nome: 'Fone Bluetooth', quantidade: 1 });
  });

  it('salva configurações e faixas de frete (RF19)', async () => {
    const { nav } = await novoAdmin(amb);
    const r = await nav.put('/admin/configuracoes', { cepOrigem: '01001-000', diasManuseio: 2, freteGratisAPartirDe: 300, parcelasMaximas: 6, parcelaMinima: 20 });
    expect(r.body).toEqual({ cepOrigem: '01001000', diasManuseio: 2, freteGratisAPartirDe: 300, parcelasMaximas: 6, parcelaMinima: 20 });
    expect((await nav.post('/admin/faixas-frete', { descricao: 'Sul', cepInicio: '90000000', cepFim: '80000000', valor: 10, prazoDias: 5 })).status).toBe(422);
    const f = await nav.post('/admin/faixas-frete', { descricao: 'Sul', cepInicio: '80000-000', cepFim: '99999-999', valor: 39.9, prazoDias: 8 });
    expect(f.body).toHaveLength(2);
  });
});

describe('LGPD (RNF07)', () => {
  let amb: Ambiente;
  beforeAll(async () => (amb = await criarAmbiente()));
  beforeEach(() => prepararBanco(amb));
  afterAll(() => amb.fechar());

  it('mascara CPF e telefone no perfil', async () => {
    const c = await novoCliente(amb);
    const r = await c.nav.get('/conta');
    expect(r.body.cpf).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
    expect(r.body.telefone).toBe('(19) *****-1234');
  });

  it('exporta os dados do titular', async () => {
    const c = await novoCliente(amb);
    await novoPedido(c);
    const r = await c.nav.get('/conta/dados');
    expect(r.headers['content-disposition']).toMatch(/meus-dados\.json/);
    expect(r.body.conta.email).toBe(c.email);
    expect(r.body.pedidos).toHaveLength(1);
    expect(r.body.conta.senhaHash).toBeUndefined();
  });

  it('não exclui conta com pedido em andamento; depois anonimiza mantendo o pedido', async () => {
    const c = await novoCliente(amb);
    const p = await novoPedido(c);
    expect((await c.nav.post('/conta/excluir', { senha: 'senha12345' })).status).toBe(422);
    await c.nav.post(`/pedidos/${p.id}/cancelar`);
    expect((await c.nav.post('/conta/excluir', { senha: 'errada' })).status).toBe(401);
    expect((await c.nav.post('/conta/excluir', { senha: 'senha12345' })).status).toBe(200);
    const { rows } = await amb.pool.query('SELECT nome, cpf, telefone, anonimizado FROM usuario WHERE id = $1', [c.id]);
    expect(rows[0]).toEqual({ nome: 'Cliente removido', cpf: null, telefone: null, anonimizado: true });
    const pedidos = await amb.pool.query('SELECT count(*)::int AS n FROM pedido WHERE usuario_id = $1', [c.id]);
    expect(pedidos.rows[0].n).toBe(1);
    expect((await c.nav.get('/conta')).status).toBe(401);
    expect((await (await amb.cliente()).post('/auth/entrar', { email: c.email, senha: 'senha12345' })).status).toBe(401);
  });
});
