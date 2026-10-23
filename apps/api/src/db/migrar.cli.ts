/* npm run db:migrar -w apps/api [-- --seed] [-- --listar] */
import { resolve } from 'node:path';
import { carregarEnvLocal } from '../config/env-local';
import { carregarConfig } from '../config/config';
import { criarPool } from './db';
import { migrar } from './migrar';
import { descreverErro } from './erro-conexao';

async function principal() {
  carregarEnvLocal();
  const config = carregarConfig();
  const args = process.argv.slice(2);
  const pool = criarPool(config.DATABASE_URL, 1);
  try {
    const aplicados = await migrar(pool, {
      pastaDb: resolve(config.MIGRACOES_DIR),
      seed: args.includes('--seed'),
      somenteListar: args.includes('--listar'),
      imagensDir: resolve(config.IMAGENS_DIR),
      log: (m) => console.log(m),
    });
    console.log(aplicados.length ? `Concluído: ${aplicados.length} script(s).` : 'Banco já está na versão mais recente.');
  } finally {
    await pool.end();
  }
}

principal().catch((erro) => {
  console.error(descreverErro(erro));
  process.exit(1);
});
