import { createHmac, randomBytes } from 'node:crypto';

/** TOTP (RFC 6238): HMAC-SHA1, 6 dígitos, passo de 30 s — compatível com Google e Microsoft Authenticator. */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PASSO = 30;

export function gerarSegredoTotp(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const byte of buffer) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

export function base32Decode(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of limpo) {
    valor = (valor << 5) | ALFABETO.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function passoAtual(agoraMs = Date.now()): number {
  return Math.floor(agoraMs / 1000 / PASSO);
}

export function codigoTotp(segredoBase32: string, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac('sha1', base32Decode(segredoBase32)).update(contador).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const numero = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(numero).padStart(6, '0');
}

/**
 * Confere o código aceitando ±1 passo de relógio. Devolve o passo usado (para impedir reuso)
 * ou null se o código não confere ou já foi usado.
 */
export function verificarTotp(segredoBase32: string, codigo: string, ultimoPassoUsado: number | null, agoraMs = Date.now()): number | null {
  const limpo = (codigo ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpo)) return null;
  const atual = passoAtual(agoraMs);
  for (const passo of [atual - 1, atual, atual + 1]) {
    if (ultimoPassoUsado !== null && passo <= ultimoPassoUsado) continue;
    if (codigoTotp(segredoBase32, passo) === limpo) return passo;
  }
  return null;
}

export function uriOtpAuth(segredo: string, email: string, emissor: string): string {
  const rotulo = encodeURIComponent(`${emissor}:${email}`);
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=30`;
}
