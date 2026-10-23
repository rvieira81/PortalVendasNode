import { resolve } from 'node:path';
import { Client, Pool } from 'pg';
import { migrar } from '../../src/db/migrar';
import { urlBancoTeste } from '../apoio/config-teste';

/** Recria o banco de teste do zero e aplica as migrações (valida os scripts a cada execução — Portão 3). */
export default async function () {
  const url = new URL(urlBancoTeste());
  const nomeBanco = url.pathname.slice(1);
  if (!/teste|test/i.test(nomeBanco)) throw new Error(`Por segurança, o banco de teste precisa ter "teste" no nome (${nomeBanco})`);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const cliente = new Client({ connectionString: admin.toString() });
  await cliente.connect();
  await cliente.query(`DROP DATABASE IF EXISTS "${nomeBanco}" WITH (FORCE)`);
  await cliente.query(`CREATE DATABASE "${nomeBanco}"`);
  await cliente.end();
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  await migrar(pool, { pastaDb: resolve(__dirname, '../../../../db') });
  await pool.end();
}
