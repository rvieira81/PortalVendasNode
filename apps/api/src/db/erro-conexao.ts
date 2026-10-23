/** Mensagem legível para falhas de conexão (no Windows o Node devolve um AggregateError sem texto). */
export function descreverErro(erro: unknown): string {
  const e = erro as { message?: string; code?: string; errors?: { code?: string }[]; cause?: unknown; getResponse?: () => { mensagem?: string } };
  const resposta = e?.getResponse?.();
  if (resposta?.mensagem) return resposta.mensagem;
  const codigos = [e?.code, ...(e?.errors ?? []).map((x) => x.code), (e?.cause as { code?: string })?.code].filter(Boolean);
  if (codigos.includes('ECONNREFUSED')) {
    return 'Não foi possível conectar ao PostgreSQL (conexão recusada). Confira se o banco está no ar (docker compose up -d db) e o DATABASE_URL do apps/api/.env.';
  }
  if (codigos.includes('28P01')) return 'Usuário ou senha do PostgreSQL incorretos. Confira o DATABASE_URL do apps/api/.env.';
  if (codigos.includes('3D000')) return 'O banco informado no DATABASE_URL não existe.';
  if (e?.cause) return descreverErro(e.cause);
  return e?.message || String(erro);
}
