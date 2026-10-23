/**
 * Dinheiro em centavos inteiros. O banco devolve numeric como string ("199.90");
 * nada de float nos cálculos (RN05).
 */
export type Centavos = number;

export function paraCentavos(valor: string | number): Centavos {
  const texto = typeof valor === 'number' ? valor.toFixed(2) : valor.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(texto)) throw new Error(`Valor monetário inválido: ${valor}`);
  const negativo = texto.startsWith('-');
  const [inteiro, fracao = ''] = texto.replace('-', '').split('.');
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, '0'));
  return negativo ? -centavos : centavos;
}

/** "199.90" — formato do numeric(12,2) para gravar no banco. */
export function paraDecimal(centavos: Centavos): string {
  const negativo = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const texto = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negativo ? `-${texto}` : texto;
}

/** 199.9 — número em reais para as respostas da API (só exibição). */
export function paraReais(centavos: Centavos): number {
  return Math.round(centavos) / 100;
}
