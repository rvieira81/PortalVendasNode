import { somarDiasUteis } from './dias-uteis';
import { parcelasPermitidas } from './parcelas';
import { gerarSlug } from './slug';
import { calcularTotais, quantidadeMaxima } from './totais';

describe('totais (RN05)', () => {
  it('soma itens, frete e desconto em centavos', () => {
    const t = calcularTotais([{ precoUnitario: 19990, quantidade: 2 }, { precoUnitario: 2990, quantidade: 1 }], 2490, 1000);
    expect(t).toEqual({ subtotal: 42970, frete: 2490, desconto: 1000, total: 44460 });
  });
  it('desconto nunca deixa o total negativo', () => {
    expect(calcularTotais([{ precoUnitario: 1000, quantidade: 1 }], 0, 5000).total).toBe(0);
  });
});

describe('limite por produto (RN09)', () => {
  it.each([
    [5, 5],
    [50, 10],
    [0, 0],
    [-2, 0],
  ])('disponível %i → máximo %i', (disponivel, maximo) => expect(quantidadeMaxima(disponivel)).toBe(maximo));
});

describe('parcelamento (RN06)', () => {
  it('limita pela parcela mínima de R$ 10', () => {
    expect(parcelasPermitidas(5990)).toBe(5);
    expect(parcelasPermitidas(19990)).toBe(12);
    expect(parcelasPermitidas(500)).toBe(1);
  });
  it('respeita o máximo configurado', () => {
    expect(parcelasPermitidas(100000, 6)).toBe(6);
  });
});

describe('vencimento do boleto (RN04)', () => {
  it('pula o fim de semana', () => {
    const sexta = new Date('2026-10-23T15:00:00Z');
    expect(somarDiasUteis(sexta, 3).toISOString().slice(0, 10)).toBe('2026-10-28');
  });
});

describe('slug', () => {
  it('remove acentos e símbolos', () => {
    expect(gerarSlug('Cafeteira Elétrica 30 Xícaras!')).toBe('cafeteira-eletrica-30-xicaras');
  });
});
