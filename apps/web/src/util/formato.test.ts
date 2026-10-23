import { cpfValido, formatarMoeda, mascaraCep, mascaraCpf, mascaraTelefone, plural } from './formato';

describe('formatação', () => {
  it('moeda em reais', () => {
    expect(formatarMoeda(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
  });
  it('máscaras de CEP, CPF e telefone', () => {
    expect(mascaraCep('13270000')).toBe('13270-000');
    expect(mascaraCpf('52998224725')).toBe('529.982.247-25');
    expect(mascaraTelefone('19999991234')).toBe('(19) 99999-1234');
    expect(mascaraTelefone('1933334444')).toBe('(19) 3333-4444');
  });
  it('valida CPF como o servidor', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-26')).toBe(false);
    expect(cpfValido('000.000.000-00')).toBe(false);
  });
  it('plural', () => {
    expect(plural(1, 'produto')).toBe('1 produto');
    expect(plural(3, 'produto')).toBe('3 produtos');
  });
});
