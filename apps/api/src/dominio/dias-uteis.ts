/** Soma dias úteis (seg–sex) a uma data. Feriados ficam por conta do banco emissor do boleto. */
export function somarDiasUteis(inicio: Date, dias: number): Date {
  const data = new Date(inicio.getTime());
  let restantes = dias;
  while (restantes > 0) {
    data.setUTCDate(data.getUTCDate() + 1);
    const dia = data.getUTCDay();
    if (dia !== 0 && dia !== 6) restantes--;
  }
  return data;
}
