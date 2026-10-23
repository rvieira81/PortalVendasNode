import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/* ---------------- Senhas (scrypt) ---------------- */

const SCRYPT = { N: 16384, r: 8, p: 1, tamanho: 64 };

function scryptAsync(senha: string, sal: Buffer, N: number, r: number, p: number, tamanho: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(senha.normalize('NFKC'), sal, tamanho, { N, r, p, maxmem: 64 * 1024 * 1024 }, (erro, chave) =>
      erro ? reject(erro) : resolve(chave),
    ),
  );
}

/** Formato: scrypt$N$r$p$salBase64$hashBase64 */
export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scryptAsync(senha, sal, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.tamanho);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString('base64'), hash.toString('base64')].join('$');
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const partes = armazenado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scryptAsync(senha, Buffer.from(sal, 'base64'), Number(N), Number(r), Number(p), esperado.length);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/* ---------------- Tokens ---------------- */

export function tokenAleatorio(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/* ---------------- Assinatura de sessão (HMAC) ---------------- */

export function assinar<T extends object>(conteudo: T, segredo: string): string {
  const corpo = Buffer.from(JSON.stringify(conteudo)).toString('base64url');
  const assinatura = createHmac('sha256', segredo).update(corpo).digest('base64url');
  return `${corpo}.${assinatura}`;
}

export function verificarAssinado<T>(token: string | undefined, segredo: string): T | null {
  if (!token) return null;
  const [corpo, assinatura] = token.split('.');
  if (!corpo || !assinatura) return null;
  const esperada = createHmac('sha256', segredo).update(corpo).digest('base64url');
  if (!iguaisEmTempoConstante(assinatura, esperada)) return null;
  try {
    return JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/* ---------------- Cifragem (AES-256-GCM) ---------------- */

function chave(chaveBase64: string): Buffer {
  const k = Buffer.from(chaveBase64, 'base64');
  if (k.length !== 32) throw new Error('CHAVE_CIFRAGEM deve ter 32 bytes em base64');
  return k;
}

export function cifrar(texto: string, chaveBase64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', chave(chaveBase64), iv);
  const dados = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), dados.toString('base64')].join(':');
}

export function decifrar(cifrado: string, chaveBase64: string): string {
  const [versao, iv, tag, dados] = cifrado.split(':');
  if (versao !== 'v1') throw new Error('Formato de cifra desconhecido');
  const decipher = createDecipheriv('aes-256-gcm', chave(chaveBase64), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dados, 'base64')), decipher.final()]).toString('utf8');
}

/* ---------------- Webhook do Mercado Pago ---------------- */

/**
 * x-signature: "ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839"
 * manifesto: "id:{data.id};request-id:{x-request-id};ts:{ts};" (data.id em minúsculas se alfanumérico)
 */
export function assinaturaWebhookValida(
  cabecalho: string | undefined,
  requestId: string | undefined,
  dataId: string,
  segredo: string,
  toleranciaSegundos = 0,
  agora = Date.now(),
): boolean {
  if (!cabecalho || !segredo || !dataId) return false;
  const partes = Object.fromEntries(
    cabecalho.split(',').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k, v.join('=')];
    }),
  );
  const ts = partes['ts'];
  const v1 = partes['v1'];
  if (!ts || !v1) return false;
  if (toleranciaSegundos > 0) {
    const tsMs = ts.length > 10 ? Number(ts) : Number(ts) * 1000;
    if (!Number.isFinite(tsMs) || Math.abs(agora - tsMs) > toleranciaSegundos * 1000) return false;
  }
  let manifesto = `id:${dataId.toLowerCase()};`;
  if (requestId) manifesto += `request-id:${requestId};`;
  manifesto += `ts:${ts};`;
  const esperado = createHmac('sha256', segredo).update(manifesto).digest('hex');
  return iguaisEmTempoConstante(esperado, v1.toLowerCase());
}
