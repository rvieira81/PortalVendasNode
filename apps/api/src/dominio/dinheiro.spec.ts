import { paraCentavos, paraDecimal, paraReais } from './dinheiro';

describe('dinheiro em centavos', () => {
  it.each([
    ['199.90', 19990],
    ['199.9', 19990],
    ['0.01', 1],
    ['10', 1000],
    ['-5.50', -550],
  ])('converte %s para %i centavos', (texto, centavos) => expect(paraCentavos(texto)).toBe(centavos));
  it('aceita número com no máximo 2 casas e evita erro de ponto flutuante', () => {
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
  });
  it('recusa formatos inválidos', () => {
    expect(() => paraCentavos('1,50')).toThrow();
    expect(() => paraCentavos('1.505')).toThrow();
  });
  it('formata para o banco e para a API', () => {
    expect(paraDecimal(19990)).toBe('199.90');
    expect(paraDecimal(5)).toBe('0.05');
    expect(paraDecimal(-550)).toBe('-5.50');
    expect(paraReais(19990)).toBe(199.9);
  });
});
