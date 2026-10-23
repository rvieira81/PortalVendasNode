import { api, ErroApi } from './cliente';

describe('cliente da API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = 'pv_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('envia o token CSRF do cookie em métodos que alteram dados', async () => {
    document.cookie = 'pv_csrf=abc123';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    await api('/carrinho/itens', 'POST', { produtoId: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/carrinho/itens');
    expect((init!.headers as Record<string, string>)['X-CSRF-Token']).toBe('abc123');
  });

  it('transforma erro da API em ErroApi com mensagem e campos', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"mensagem":"Confira os campos.","campos":{"cpf":"CPF inválido."}}', { status: 400 }));
    const erro = (await api('/produtos').catch((e: unknown) => e)) as ErroApi;
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.message).toBe('Confira os campos.');
    expect(erro.campos.cpf).toBe('CPF inválido.');
  });

  it('mensagem clara quando o servidor está fora', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api('/produtos')).rejects.toThrow(/Sem conexão/);
  });
});
