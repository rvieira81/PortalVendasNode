import { createHmac } from 'node:crypto';
import { assinar, assinaturaWebhookValida, cifrar, decifrar, gerarHashSenha, verificarAssinado, verificarSenha } from './seguranca';
import { codigoTotp, gerarSegredoTotp, passoAtual, verificarTotp, base32Encode } from './totp';

const CHAVE = Buffer.alloc(32, 7).toString('base64');

describe('senhas (RNF02)', () => {
  it('gera hash scrypt com sal e confere', async () => {
    const hash = await gerarHashSenha('senha12345');
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verificarSenha('senha12345', hash)).toBe(true);
    expect(await verificarSenha('senha12346', hash)).toBe(false);
    expect(await gerarHashSenha('senha12345')).not.toBe(hash);
  });
  it('recusa hash em formato desconhecido', async () => {
    expect(await verificarSenha('x', 'md5$abc')).toBe(false);
  });
});

describe('cookie de sessão assinado', () => {
  it('confere a assinatura e rejeita adulteração', () => {
    const token = assinar({ uid: 1, mfa: false }, 'segredo-com-mais-de-32-caracteres!!');
    expect(verificarAssinado(token, 'segredo-com-mais-de-32-caracteres!!')).toEqual({ uid: 1, mfa: false });
    const [corpo, assinatura] = token.split('.');
    const adulterado = Buffer.from(JSON.stringify({ uid: 2, mfa: true })).toString('base64url');
    expect(verificarAssinado(`${adulterado}.${assinatura}`, 'segredo-com-mais-de-32-caracteres!!')).toBeNull();
    expect(verificarAssinado(`${corpo}.${assinatura}`, 'outro-segredo-com-mais-de-32-caracteres')).toBeNull();
    expect(verificarAssinado(undefined, 'x')).toBeNull();
  });
});

describe('cifragem AES-256-GCM', () => {
  it('cifra, decifra e detecta adulteração', () => {
    const c = cifrar('JBSWY3DPEHPK3PXP', CHAVE);
    expect(c).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decifrar(c, CHAVE)).toBe('JBSWY3DPEHPK3PXP');
    const partes = c.split(':');
    partes[3] = Buffer.from('xxxxxxxx').toString('base64');
    expect(() => decifrar(partes.join(':'), CHAVE)).toThrow();
  });
});

describe('assinatura do webhook (RF13)', () => {
  const segredo = 'segredo-do-webhook';
  const assinar = (manifesto: string) => createHmac('sha256', segredo).update(manifesto).digest('hex');

  it('aceita a assinatura no formato do Mercado Pago', () => {
    const v1 = assinar('id:123456;request-id:abc-123;ts:1704908010;');
    expect(assinaturaWebhookValida(`ts=1704908010,v1=${v1}`, 'abc-123', '123456', segredo)).toBe(true);
  });
  it('aceita sem x-request-id', () => {
    const v1 = assinar('id:999;ts:1704908010;');
    expect(assinaturaWebhookValida(`ts=1704908010,v1=${v1}`, undefined, '999', segredo)).toBe(true);
  });
  it('recusa assinatura errada, id trocado ou cabeçalho ausente', () => {
    const v1 = assinar('id:123456;request-id:abc-123;ts:1704908010;');
    expect(assinaturaWebhookValida(`ts=1704908010,v1=${v1}`, 'abc-123', '654321', segredo)).toBe(false);
    expect(assinaturaWebhookValida(`ts=1704908010,v1=${'0'.repeat(64)}`, 'abc-123', '123456', segredo)).toBe(false);
    expect(assinaturaWebhookValida(undefined, 'abc-123', '123456', segredo)).toBe(false);
    expect(assinaturaWebhookValida(`ts=1704908010,v1=${v1}`, 'abc-123', '123456', '')).toBe(false);
  });
  it('recusa notificação antiga quando há tolerância', () => {
    const ts = '1704908010';
    const v1 = assinar(`id:1;ts:${ts};`);
    expect(assinaturaWebhookValida(`ts=${ts},v1=${v1}`, undefined, '1', segredo, 300, 1704908010_000 + 3_600_000)).toBe(false);
  });
});

describe('TOTP (RFC 6238)', () => {
  // Vetor de teste da RFC 6238 (SHA1, segredo "12345678901234567890", T = 59 s → 94287082; 6 dígitos = 287082)
  const segredoRfc = base32Encode(Buffer.from('12345678901234567890'));
  it('gera o código do vetor da RFC', () => {
    expect(codigoTotp(segredoRfc, Math.floor(59 / 30))).toBe('287082');
    expect(codigoTotp(segredoRfc, Math.floor(1111111109 / 30))).toBe('081804');
  });
  it('aceita ±1 passo e devolve o passo usado', () => {
    const agora = Date.now();
    const s = gerarSegredoTotp();
    const passo = passoAtual(agora);
    expect(verificarTotp(s, codigoTotp(s, passo - 1), null, agora)).toBe(passo - 1);
    expect(verificarTotp(s, codigoTotp(s, passo + 2), null, agora)).toBeNull();
  });
  it('não aceita o mesmo código duas vezes', () => {
    const agora = Date.now();
    const s = gerarSegredoTotp();
    const passo = passoAtual(agora);
    const codigo = codigoTotp(s, passo);
    expect(verificarTotp(s, codigo, passo, agora)).toBeNull();
    expect(verificarTotp(s, 'abc123', null, agora)).toBeNull();
  });
});
