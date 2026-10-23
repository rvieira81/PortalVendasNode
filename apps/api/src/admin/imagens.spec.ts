import { extensaoPelaAssinatura } from './imagens';

describe('upload de imagens (RF17)', () => {
  it('identifica o tipo real pelos primeiros bytes', () => {
    expect(extensaoPelaAssinatura(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpg');
    expect(extensaoPelaAssinatura(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(extensaoPelaAssinatura(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'latin1'))).toBe('webp');
  });
  it('recusa arquivo disfarçado de imagem', () => {
    expect(extensaoPelaAssinatura(Buffer.from('<?php echo 1; ?>'))).toBeNull();
    expect(extensaoPelaAssinatura(Buffer.from('GIF89a'))).toBeNull();
  });
});
