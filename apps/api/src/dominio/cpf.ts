export function somenteDigitos(valor: string): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** Valida os dígitos verificadores do CPF (RF05). */
export function cpfValido(valor: string): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(cpf.slice(0, 9), 10);
  const d2 = digito(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

/** "***.456.789-**" — LGPD (RNF07). */
export function mascararCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const d = somenteDigitos(cpf);
  if (d.length !== 11) return '***';
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** "(19) *****-4321" */
export function mascararTelefone(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  const d = somenteDigitos(telefone);
  if (d.length < 10) return '***';
  return `(${d.slice(0, 2)}) *****-${d.slice(-4)}`;
}

export function cepValido(cep: string): boolean {
  return /^\d{8}$/.test(somenteDigitos(cep)) && somenteDigitos(cep).length === 8;
}
