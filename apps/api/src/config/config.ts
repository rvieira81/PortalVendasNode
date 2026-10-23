import { z } from 'zod';

const booleano = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : ['1', 'true', 'sim', 'yes'].includes(v.toLowerCase())));

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORTA: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  DB_POOL_MAX: z.coerce.number().int().default(10),
  URL_SITE: z.string().url().default('http://localhost:5173'),
  NOME_LOJA: z.string().default('Portal de Vendas'),
  SESSAO_SEGREDO: z.string().min(32, 'SESSAO_SEGREDO precisa de pelo menos 32 caracteres'),
  SESSAO_HORAS: z.coerce.number().default(12),
  CHAVE_CIFRAGEM: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'CHAVE_CIFRAGEM: 32 bytes em base64'),
  COOKIE_SEGURO: booleano,
  IMAGENS_DIR: z.string().default('./dados/imagens'),
  MIGRACOES_DIR: z.string().default('../../db'),
  LOG_NIVEL: z.string().default('info'),
  SWAGGER: booleano,
  MANUTENCAO_ATIVA: booleano,
  LIMITE_REQUISICOES_ATIVO: booleano,
  MANUTENCAO_INTERVALO_MIN: z.coerce.number().default(5),

  MP_ACCESS_TOKEN: z.string().default(''),
  MP_PUBLIC_KEY: z.string().default(''),
  MP_SEGREDO_WEBHOOK: z.string().default(''),
  MP_URL_NOTIFICACAO: z.string().default(''),
  MP_URL_API: z.string().default('https://api.mercadopago.com'),

  ME_TOKEN: z.string().default(''),
  ME_URL_API: z.string().default('https://sandbox.melhorenvio.com.br'),
  ME_EMAIL_CONTATO: z.string().default('contato@sualoja.com.br'),
  ME_SERVICOS: z.string().default(''),

  SMTP_HOST: z.string().default(''),
  SMTP_PORTA: z.coerce.number().default(587),
  SMTP_USUARIO: z.string().default(''),
  SMTP_SENHA: z.string().default(''),
  SMTP_REMETENTE: z.string().default('Portal de Vendas <nao-responda@sualoja.com.br>'),
  EMAIL_PASTA: z.string().default(''),
});

export type Config = z.infer<typeof esquema> & {
  cookieSeguro: boolean;
  swagger: boolean;
  manutencaoAtiva: boolean;
  limiteRequisicoesAtivo: boolean;
};

export const CONFIG = Symbol('CONFIG');

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquema.safeParse(env);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida:\n${problemas}`);
  }
  const c = resultado.data;
  const producao = c.NODE_ENV === 'production';
  return {
    ...c,
    cookieSeguro: c.COOKIE_SEGURO ?? producao,
    swagger: c.SWAGGER ?? !producao,
    manutencaoAtiva: c.MANUTENCAO_ATIVA ?? c.NODE_ENV !== 'test',
    limiteRequisicoesAtivo: c.LIMITE_REQUISICOES_ATIVO ?? true,
  };
}
