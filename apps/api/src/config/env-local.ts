import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Carrega apps/api/.env (desenvolvimento). Variáveis já definidas no ambiente têm prioridade. */
export function carregarEnvLocal() {
  for (const caminho of [resolve('.env'), resolve(__dirname, '../../.env')]) {
    if (existsSync(caminho)) {
      process.loadEnvFile(caminho);
      return;
    }
  }
}
