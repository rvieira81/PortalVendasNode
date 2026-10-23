import { Ambiente, criarAmbiente, IDS, prepararBanco } from './apoio/ambiente';

describe('Catálogo (RF01–RF03)', () => {
  let amb: Ambiente;
  beforeAll(async () => {
    amb = await criarAmbiente();
    await prepararBanco(amb);
  });
  afterAll(() => amb.fechar());

  const get = async (url: string) => (await (await amb.cliente()).get(url)).body;

  it('lista só produtos ativos de categorias ativas e marca esgotados', async () => {
    const r = await get('/produtos');
    const skus = r.itens.map((p: { slug: string }) => p.slug);
    expect(skus).toEqual(expect.arrayContaining(['fone', 'cabo', 'cafeteira', 'panela']));
    expect(skus).not.toContain('inativo');
    expect(skus).not.toContain('arquivado');
    expect(r.itens.find((p: { slug: string }) => p.slug === 'panela').esgotado).toBe(true);
    expect(r.tamanhoPagina).toBe(12);
  });

  it('pagina de 12 em 12', async () => {
    await amb.pool.query(`INSERT INTO produto (categoria_id, sku, nome, slug, preco, estoque, peso_kg, altura_cm, largura_cm, comprimento_cm, criado_por)
      SELECT 1, 'X' || g, 'Extra ' || g, 'extra-' || g, 10 + g, 1, 1, 1, 1, 1, 't' FROM generate_series(1, 26) g`);
    const p1 = await get('/produtos');
    const p3 = await get('/produtos?pagina=3');
    expect(p1.itens).toHaveLength(12);
    expect(p1.total).toBe(30);
    expect(p1.paginas).toBe(3);
    expect(p3.itens).toHaveLength(6);
    await amb.pool.query(`DELETE FROM produto WHERE sku LIKE 'X%'`);
  });

  it('busca sem diferenciar acentos e maiúsculas (RF02)', async () => {
    const r = await get('/produtos?busca=ELETRICA');
    expect(r.itens.map((p: { slug: string }) => p.slug)).toEqual(['cafeteira']);
    expect((await get('/produtos?busca=100%25')).total).toBe(0);
  });

  it('filtra por categoria e preço e ordena', async () => {
    const r = await get('/produtos?categoria=eletronicos&precoMax=200&ordem=menor-preco');
    expect(r.itens.map((p: { slug: string }) => p.slug)).toEqual(['cabo', 'fone']);
    const caro = await get('/produtos?ordem=maior-preco');
    expect(caro.itens[0].slug).toBe('fone');
  });

  it('mostra o detalhe com parcelas e 404 para inativo ou inexistente', async () => {
    const nav = await amb.cliente();
    const d = (await nav.get('/produtos/fone')).body;
    expect(d).toMatchObject({ id: IDS.fone, preco: 199.9, precoDe: 249.9, disponivel: 5, maximoNoCarrinho: 5 });
    expect(d.parcelas.quantidade).toBe(12);
    expect((await nav.get('/produtos/inativo')).status).toBe(404);
    expect((await nav.get('/produtos/nao-existe')).status).toBe(404);
  });

  it('valida parâmetros de consulta', async () => {
    const nav = await amb.cliente();
    expect((await nav.get('/produtos?ordem=drop-table')).status).toBe(400);
    expect((await nav.get('/produtos?pagina=0')).status).toBe(400);
  });

  it('responde ao health check', async () => {
    const r = await (await amb.cliente()).get('/health');
    expect(r.body).toEqual({ status: 'ok' });
  });
});
