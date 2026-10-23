import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Banco = NodePgDatabase<typeof schema>;
/** Cliente dentro de uma transação (mesma API do Banco). */
export type Transacao = Parameters<Parameters<Banco['transaction']>[0]>[0];
export type BancoOuTransacao = Banco | Transacao;

export const BANCO = Symbol('BANCO');
export const POOL = Symbol('POOL');

export function criarPool(url: string, max = 10): Pool {
  // timestamptz sempre em UTC na sessão
  return new Pool({ connectionString: url, max, application_name: 'portal-vendas-api', options: '-c TimeZone=UTC' });
}

export function criarBanco(pool: Pool): Banco {
  return drizzle(pool, { schema });
}
