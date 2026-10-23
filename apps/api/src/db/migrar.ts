import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

export interface OpcoesMigracao {
  /** Pasta que contém migrations/ e seed/ */
  pastaDb: string;
  seed?: boolean;
  somenteListar?: boolean;
  imagensDir?: string;
  log?: (mensagem: string) => void;
}

const BLOQUEIO_MIGRACAO = 727000;

/**
 * Aplica db/migrations/V*.sql em ordem, cada um numa transação, registrando em schema_versao (ADR-003).
 * Um advisory lock impede que duas réplicas migrem ao mesmo tempo.
 */
export async function migrar(pool: Pool, opcoes: OpcoesMigracao): Promise<string[]> {
  const log = opcoes.log ?? (() => undefined);
  const cliente = await pool.connect();
  const aplicados: string[] = [];
  try {
    await cliente.query('SELECT pg_advisory_lock($1)', [BLOQUEIO_MIGRACAO]);
    await cliente.query(`
      CREATE TABLE IF NOT EXISTS schema_versao (
        versao       varchar(20)  PRIMARY KEY,
        arquivo      varchar(200) NOT NULL,
        checksum     char(64)     NOT NULL,
        aplicado_em  timestamptz  NOT NULL DEFAULT now()
      )`);
    const { rows } = await cliente.query<{ versao: string; checksum: string }>('SELECT versao, checksum FROM schema_versao');
    const jaAplicados = new Map(rows.map((r) => [r.versao, r.checksum]));

    const pastaMigracoes = join(opcoes.pastaDb, 'migrations');
    const arquivos = (await readdir(pastaMigracoes)).filter((a) => /^V\d{3}__.+\.sql$/.test(a)).sort();
    for (const arquivo of arquivos) {
      const versao = arquivo.split('__')[0];
      const sql = await readFile(join(pastaMigracoes, arquivo), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const anterior = jaAplicados.get(versao);
      if (anterior) {
        if (anterior !== checksum) log(`AVISO: ${arquivo} foi alterado depois de aplicado (checksum diferente)`);
        continue;
      }
      if (opcoes.somenteListar) {
        log(`pendente: ${arquivo}`);
        aplicados.push(arquivo);
        continue;
      }
      log(`aplicando ${arquivo}...`);
      await cliente.query('BEGIN');
      try {
        await cliente.query(sql);
        await cliente.query('INSERT INTO schema_versao (versao, arquivo, checksum) VALUES ($1, $2, $3)', [versao, arquivo, checksum]);
        await cliente.query('COMMIT');
      } catch (erro) {
        await cliente.query('ROLLBACK');
        throw new Error(`Falha em ${arquivo}: ${(erro as Error).message}`);
      }
      aplicados.push(arquivo);
    }

    if (opcoes.seed && !opcoes.somenteListar) {
      const pastaSeed = join(opcoes.pastaDb, 'seed');
      const seeds = (await readdir(pastaSeed)).filter((a) => /^S\d{3}__.+\.sql$/.test(a)).sort();
      for (const arquivo of seeds) {
        log(`seed ${arquivo}...`);
        await cliente.query(await readFile(join(pastaSeed, arquivo), 'utf8'));
      }
      if (opcoes.imagensDir) await copiarImagensSeed(join(pastaSeed, 'imagens'), opcoes.imagensDir, log);
    }
    return aplicados;
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1)', [BLOQUEIO_MIGRACAO]).catch(() => undefined);
    cliente.release();
  }
}

async function copiarImagensSeed(origem: string, destino: string, log: (m: string) => void) {
  const existe = await stat(origem).then(() => true, () => false);
  if (!existe) return;
  await mkdir(destino, { recursive: true });
  const arquivos = await readdir(origem);
  for (const arquivo of arquivos) await copyFile(join(origem, arquivo), join(destino, arquivo));
  log(`${arquivos.length} imagens de exemplo copiadas para ${destino}`);
}
