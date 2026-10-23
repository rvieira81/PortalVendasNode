import { randomUUID } from 'node:crypto';
import { Ambiente, criarAmbiente, estoque, IDS, novoCliente, novoEndereco, novoPedido, prepararBanco } from './apoio/ambiente';

describe('Frete e pedidos (RF07–RF09, RF14, RF16)', () => {
  let amb: Ambiente;
  beforeAll(async () => (amb = await criarAmbiente()));
  beforeEach(() => prepararBanco(amb));
  afterAll(() => amb.fechar());

  describe('endereços', () => {
    it('consulta o CEP e cadastra endereço; o primeiro vira padrão', async () => {
      const c = await novoCliente(amb);
      expect((await c.nav.get('/cep/13270-000')).body.cidade).toBe('Valinhos');
      expect((await c.nav.get('/cep/00000000')).status).toBe(404);
      await novoEndereco(c.nav);
      await novoEndereco(c.nav);
      const lista = (await c.nav.get('/conta/enderecos')).body;
      expect(lista.filter((e: { padrao: boolean }) => e.padrao)).toHaveLength(1);
    });

    it('valida UF e CEP', async () => {
      const c = await novoCliente(amb);
      const r = await c.nav.post('/conta/enderecos', { apelido: 'X', destinatario: 'Y', cep: '123', logradouro: 'R', numero: '1', bairro: 'B', cidade: 'C', uf: 'XX' });
      expect(r.status).toBe(400);
      expect(Object.keys(r.body.campos)).toEqual(expect.arrayContaining(['cep', 'uf']));
    });

    it('não deixa ver ou apagar o endereço de outro cliente (IDOR)', async () => {
      const a = await novoCliente(amb);
      const b = await novoCliente(amb);
      const id = await novoEndereco(a.nav);
      expect((await b.nav.delete(`/conta/enderecos/${id}`)).status).toBe(404);
    });
  });

  describe('frete (RF08)', () => {
    it('cota no provedor, soma o manuseio e ordena pelo preço', async () => {
      const nav = await amb.cliente();
      await nav.post('/carrinho/itens', { produtoId: IDS.fone, quantidade: 1 });
      const r = await nav.post('/frete/cotacao', { cep: '13270-000' });
      expect(r.body.map((o: { codigo: string; prazoDias: number; valor: number }) => [o.codigo, o.prazoDias, o.valor])).toEqual([
        ['me-1', 7, 24.9],
        ['me-2', 3, 45.9],
      ]);
    });

    it('usa a tabela de contingência quando o provedor falha', async () => {
      amb.frete.falhar = true;
      const nav = await amb.cliente();
      await nav.post('/carrinho/itens', { produtoId: IDS.fone, quantidade: 1 });
      const r = await nav.post('/frete/cotacao', { cep: '13270000' });
      expect(r.body).toEqual([expect.objectContaining({ codigo: 'faixa-1', valor: 24.9, prazoDias: 6 })]);
    });

    it('avisa quando não entrega no CEP', async () => {
      amb.frete.ativo = false;
      const nav = await amb.cliente();
      await nav.post('/carrinho/itens', { produtoId: IDS.fone, quantidade: 1 });
      const r = await nav.post('/frete/cotacao', { cep: '69900000' });
      expect(r.status).toBe(422);
      expect(r.body.mensagem).toBe('Não entregamos neste CEP.');
    });

    it('aplica frete grátis na opção mais barata', async () => {
      await amb.pool.query(`UPDATE configuracao SET valor = '150.00' WHERE chave = 'frete.gratis_a_partir_de'`);
      const nav = await amb.cliente();
      await nav.post('/carrinho/itens', { produtoId: IDS.fone, quantidade: 1 });
      const r = await nav.post('/frete/cotacao', { cep: '13270000' });
      expect(r.body[0]).toMatchObject({ valor: 0, gratis: true });
      expect(r.body[1].gratis).toBe(false);
    });
  });

  describe('checkout (RF09)', () => {
    it('cria o pedido com valores do servidor e reserva o estoque', async () => {
      const c = await novoCliente(amb);
      const p = await novoPedido(c, [[IDS.fone, 2], [IDS.cabo, 1]]);
      expect(p).toMatchObject({ status: 1, subtotal: 429.7, frete: 24.9, total: 454.6, podePagar: true });
      expect(await estoque(amb, IDS.fone)).toEqual({ estoque: 5, reservado: 2 });
      expect((await c.nav.get('/carrinho')).body.itens).toHaveLength(0);
      expect(amb.email.enviados.at(-1)!.assunto).toMatch(/recebemos seu pedido/);
    });

    it('exige e-mail confirmado', async () => {
      const c = await novoCliente(amb, { confirmar: false });
      await c.nav.post('/carrinho/itens', { produtoId: IDS.cabo, quantidade: 1 });
      const enderecoId = await novoEndereco(c.nav);
      const r = await c.nav.post('/pedidos', { enderecoId, freteCodigo: 'me-1', chaveIdempotencia: randomUUID() });
      expect(r.status).toBe(403);
      expect(r.body.codigo).toBe('email-nao-confirmado');
    });

    it('é idempotente: duplo clique cria um pedido só', async () => {
      const c = await novoCliente(amb);
      await c.nav.post('/carrinho/itens', { produtoId: IDS.cabo, quantidade: 1 });
      const enderecoId = await novoEndereco(c.nav);
      const corpo = { enderecoId, freteCodigo: 'me-1', chaveIdempotencia: randomUUID() };
      const [a, b] = await Promise.all([c.nav.post('/pedidos', corpo), c.nav.post('/pedidos', corpo)]);
      expect(a.body.id).toBe(b.body.id);
      const { rows } = await amb.pool.query('SELECT count(*)::int AS n FROM pedido');
      expect(rows[0].n).toBe(1);
      expect(await estoque(amb, IDS.cabo)).toEqual({ estoque: 100, reservado: 1 });
    });

    it('não vende a última unidade duas vezes (RN03)', async () => {
      const a = await novoCliente(amb);
      const b = await novoCliente(amb);
      for (const c of [a, b]) await c.nav.post('/carrinho/itens', { produtoId: IDS.cafe, quantidade: 2 });
      const [ea, eb] = await Promise.all([novoEndereco(a.nav), novoEndereco(b.nav)]);
      const [ra, rb] = await Promise.all([
        a.nav.post('/pedidos', { enderecoId: ea, freteCodigo: 'me-1', chaveIdempotencia: randomUUID() }),
        b.nav.post('/pedidos', { enderecoId: eb, freteCodigo: 'me-1', chaveIdempotencia: randomUUID() }),
      ]);
      const status = [ra.status, rb.status].sort();
      expect(status).toEqual([201, 409]);
      const perdedor = ra.status === 409 ? ra : rb;
      expect(perdedor.body.indisponiveis).toEqual(['Cafeteira Elétrica']);
      expect(await estoque(amb, IDS.cafe)).toEqual({ estoque: 2, reservado: 2 });
    });

    it('recusa opção de frete que não existe mais', async () => {
      const c = await novoCliente(amb);
      await c.nav.post('/carrinho/itens', { produtoId: IDS.cabo, quantidade: 1 });
      const enderecoId = await novoEndereco(c.nav);
      const r = await c.nav.post('/pedidos', { enderecoId, freteCodigo: 'me-99', chaveIdempotencia: randomUUID() });
      expect(r.status).toBe(409);
      expect(r.body.codigo).toBe('frete-alterado');
    });

    it('não usa endereço de outro cliente', async () => {
      const a = await novoCliente(amb);
      const b = await novoCliente(amb);
      const enderecoDeA = await novoEndereco(a.nav);
      await b.nav.post('/carrinho/itens', { produtoId: IDS.cabo, quantidade: 1 });
      const r = await b.nav.post('/pedidos', { enderecoId: enderecoDeA, freteCodigo: 'me-1', chaveIdempotencia: randomUUID() });
      expect(r.status).toBe(404);
    });

    it('preço do pedido fica congelado (RN01)', async () => {
      const c = await novoCliente(amb);
      const p = await novoPedido(c, [[IDS.cabo, 1]]);
      await amb.pool.query('UPDATE produto SET preco = 99.90 WHERE id = $1', [IDS.cabo]);
      const d = (await c.nav.get(`/pedidos/${p.id}`)).body;
      expect(d.itens[0].precoUnitario).toBe(29.9);
    });
  });

  describe('meus pedidos (RF14) e cancelamento (RF16)', () => {
    it('lista só os próprios pedidos; o de outro cliente é 404', async () => {
      const a = await novoCliente(amb);
      const b = await novoCliente(amb);
      const p = await novoPedido(a);
      expect((await a.nav.get('/pedidos')).body).toHaveLength(1);
      expect((await b.nav.get('/pedidos')).body).toHaveLength(0);
      expect((await b.nav.get(`/pedidos/${p.id}`)).status).toBe(404);
      expect((await b.nav.post(`/pedidos/${p.id}/cancelar`)).status).toBe(404);
    });

    it('cancelar devolve a reserva e registra o histórico', async () => {
      const c = await novoCliente(amb);
      const p = await novoPedido(c, [[IDS.fone, 2]]);
      const r = await c.nav.post(`/pedidos/${p.id}/cancelar`);
      expect(r.body.status).toBe(9);
      expect(r.body.historico.map((h: { status: number }) => h.status)).toEqual([1, 9]);
      expect(await estoque(amb, IDS.fone)).toEqual({ estoque: 5, reservado: 0 });
      expect((await c.nav.post(`/pedidos/${p.id}/cancelar`)).status).toBe(409);
    });
  });
});
