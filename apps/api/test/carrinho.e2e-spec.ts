import { Ambiente, criarAmbiente, IDS, novoCliente, prepararBanco } from './apoio/ambiente';

describe('Carrinho (RF04)', () => {
  let amb: Ambiente;
  beforeAll(async () => (amb = await criarAmbiente()));
  beforeEach(() => prepararBanco(amb));
  afterAll(() => amb.fechar());

  it('visitante adiciona, altera e remove itens', async () => {
    const nav = await amb.cliente();
    let r = await nav.post('/carrinho/itens', { produtoId: IDS.cabo, quantidade: 2 });
    expect(r.body).toMatchObject({ quantidadeItens: 2, subtotal: 59.8 });
    r = await nav.post('/carrinho/itens', { produtoId: IDS.cabo, quantidade: 1 });
    expect(r.body.itens[0].quantidade).toBe(3);
    r = await nav.patch(`/carrinho/itens/${IDS.cabo}`, { quantidade: 1 });
    expect(r.body.subtotal).toBe(29.9);
    r = await nav.delete(`/carrinho/itens/${IDS.cabo}`);
    expect(r.body.itens).toHaveLength(0);
  });

  it('limita ao estoque e avisa "Quantidade indisponível"', async () => {
    const nav = await amb.cliente();
    const r = await nav.post('/carrinho/itens', { produtoId: IDS.fone, quantidade: 6 });
    expect(r.status).toBe(201);
    expect(r.body.itens[0].quantidade).toBe(5);
    expect(r.body.aviso).toMatch(/Quantidade indisponível/);
  });

  it('limita a 10 por produto (RN09)', async () => {
    const nav = await amb.cliente();
    await nav.post('/carrinho/itens', { produtoId: IDS.cabo, quantidade: 8 });
    const r = await nav.post('/carrinho/itens', { produtoId: IDS.cabo, quantidade: 5 });
    expect(r.body.itens[0].quantidade).toBe(10);
    expect((await nav.patch(`/carrinho/itens/${IDS.cabo}`, { quantidade: 11 })).status).toBe(400);
  });

  it('recusa produto esgotado ou inativo', async () => {
    const nav = await amb.cliente();
    expect((await nav.post('/carrinho/itens', { produtoId: IDS.esgotado, quantidade: 1 })).status).toBe(422);
    expect((await nav.post('/carrinho/itens', { produtoId: IDS.inativo, quantidade: 1 })).status).toBe(422);
  });

  it('avisa quando o preço mudou desde a inclusão', async () => {
    const nav = await amb.cliente();
    await nav.post('/carrinho/itens', { produtoId: IDS.cabo, quantidade: 1 });
    await amb.pool.query('UPDATE produto SET preco = 34.90 WHERE id = $1', [IDS.cabo]);
    const r = await nav.get('/carrinho');
    expect(r.body.itens[0]).toMatchObject({ precoUnitario: 34.9, precoAnterior: 29.9 });
    expect(r.body.avisos[0]).toMatch(/mudou/);
  });

  it('mescla o carrinho do visitante ao entrar na conta', async () => {
    const c = await novoCliente(amb);
    await c.nav.post('/carrinho/itens', { produtoId: IDS.cabo, quantidade: 2 });
    await c.nav.post('/auth/sair');
    const visitante = await amb.cliente();
    await visitante.post('/carrinho/itens', { produtoId: IDS.cabo, quantidade: 3 });
    await visitante.post('/carrinho/itens', { produtoId: IDS.fone, quantidade: 1 });
    await visitante.post('/auth/entrar', { email: c.email, senha: 'senha12345' });
    const r = await visitante.get('/carrinho');
    const quantidades = Object.fromEntries(r.body.itens.map((i: { produtoId: number; quantidade: number }) => [i.produtoId, i.quantidade]));
    expect(quantidades).toEqual({ [IDS.cabo]: 5, [IDS.fone]: 1 });
  });

  it('carrinho de um visitante não aparece para outro', async () => {
    const a = await amb.cliente();
    await a.post('/carrinho/itens', { produtoId: IDS.cabo, quantidade: 1 });
    const b = await amb.cliente();
    expect((await b.get('/carrinho')).body.itens).toHaveLength(0);
  });
});
