import { Centavos } from './dinheiro';

/** RN06 — de 1 a 12 vezes, parcela mínima configurável (padrão R$ 10,00). */
export function parcelasPermitidas(total: Centavos, maximo = 12, parcelaMinima: Centavos = 1000): number {
  if (total <= 0) return 0;
  const porMinimo = Math.floor(total / Math.max(parcelaMinima, 1));
  return Math.max(1, Math.min(maximo, 12, porMinimo));
}
