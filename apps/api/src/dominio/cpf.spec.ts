import { cepValido, cpfValido, mascararCpf, mascararTelefone } from './cpf';

describe('CPF (RF05)', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('aceita CPF válido %s', (cpf) => expect(cpfValido(cpf)).toBe(true));
  it.each(['529.982.247-26', '111.111.111-11', '123', '', '5299822472a'])('recusa CPF inválido "%s"', (cpf) => expect(cpfValido(cpf)).toBe(false));
  it('mascara CPF e telefone (LGPD)', () => {
    expect(mascararCpf('52998224725')).toBe('***.982.247-**');
    expect(mascararTelefone('19999991234')).toBe('(19) *****-1234');
    expect(mascararCpf(null)).toBeNull();
  });
  it('valida CEP com 8 dígitos', () => {
    expect(cepValido('13270-000')).toBe(true);
    expect(cepValido('1327000')).toBe(false);
  });
});
