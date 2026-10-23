import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ErroNegocio } from '../comum/erros';

export const TAMANHO_MAXIMO_IMAGEM = 2 * 1024 * 1024; // RF17

/** Tipo real pelos primeiros bytes (não confia na extensão nem no Content-Type enviado). */
export function extensaoPelaAssinatura(buffer: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export async function gravarImagem(pasta: string, buffer: Buffer): Promise<string> {
  if (buffer.length > TAMANHO_MAXIMO_IMAGEM) throw new ErroNegocio('Imagem maior que 2 MB.');
  const extensao = extensaoPelaAssinatura(buffer);
  if (!extensao) throw new ErroNegocio('Envie imagens JPG, PNG ou WebP.');
  const nome = `${randomUUID().replace(/-/g, '')}.${extensao}`;
  await mkdir(resolve(pasta), { recursive: true });
  await writeFile(join(resolve(pasta), nome), buffer, { flag: 'wx' });
  return nome;
}

export async function apagarImagem(pasta: string, arquivo: string) {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(arquivo)) return;
  await unlink(join(resolve(pasta), arquivo)).catch(() => undefined);
}
