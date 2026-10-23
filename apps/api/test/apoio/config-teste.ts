import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carregarConfig } from '../../src/config/config';

export function urlBancoTeste() {
  return process.env.DATABASE_URL_TESTE ?? 'postgres://portal:portal@localhost:5433/portalvendas_teste';
}

export const SEGREDO_WEBHOOK = 'segredo-webhook-teste';

export function configTeste() {
  return carregarConfig({
    NODE_ENV: 'test',
    DATABASE_URL: urlBancoTeste(),
    DB_POOL_MAX: '5',
    SESSAO_SEGREDO: 'segredo-de-sessao-para-testes-com-mais-de-32',
    CHAVE_CIFRAGEM: Buffer.alloc(32, 3).toString('base64'),
    IMAGENS_DIR: mkdtempSync(join(tmpdir(), 'pv-imagens-')),
    LOG_NIVEL: 'silent',
    MANUTENCAO_ATIVA: 'false',
    LIMITE_REQUISICOES_ATIVO: 'false',
    SWAGGER: 'false',
    MP_SEGREDO_WEBHOOK: SEGREDO_WEBHOOK,
    MP_ACCESS_TOKEN: 'TEST-falso',
    MP_PUBLIC_KEY: 'TEST-publica',
    URL_SITE: 'http://loja.teste',
  });
}
