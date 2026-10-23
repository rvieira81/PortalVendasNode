/** Cliente HTTP da API: mesma origem, cookies de sessão e cabeçalho CSRF (ADR-004). */

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly campos: Record<string, string> = {},
    readonly dados: Record<string, unknown> = {},
  ) {
    super(mensagem);
  }
}

function lerCookie(nome: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${nome}=`))
    ?.split('=')[1];
}

async function garantirCsrf(): Promise<string> {
  let token = lerCookie('pv_csrf');
  if (!token) {
    await fetch('/api/auth/sessao', { credentials: 'same-origin' });
    token = lerCookie('pv_csrf');
  }
  return decodeURIComponent(token ?? '');
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T>(caminho: string, metodo: Metodo = 'GET', corpo?: unknown): Promise<T> {
  const cabecalhos: Record<string, string> = { Accept: 'application/json' };
  const ehFormulario = corpo instanceof FormData;
  if (corpo !== undefined && !ehFormulario) cabecalhos['Content-Type'] = 'application/json';
  if (metodo !== 'GET') cabecalhos['X-CSRF-Token'] = await garantirCsrf();

  let resposta: Response;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      credentials: 'same-origin',
      body: corpo === undefined ? undefined : ehFormulario ? corpo : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Verifique sua internet e tente de novo.');
  }
  if (resposta.status === 204) return undefined as T;
  const texto = await resposta.text();
  const dados = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  if (!resposta.ok) {
    throw new ErroApi(
      resposta.status,
      String(dados.mensagem ?? 'Não foi possível concluir a operação.'),
      (dados.campos as Record<string, string>) ?? {},
      dados,
    );
  }
  return dados as T;
}

export function mensagemDeErro(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : 'Erro inesperado. Tente de novo.';
}
