import { Centavos } from './dinheiro';

export interface ItemCalculo {
  precoUnitario: Centavos;
  quantidade: number;
}

/** RN05 — total = Σ(preço × quantidade) + frete − desconto, nunca negativo. */
export function calcularTotais(itens: ItemCalculo[], frete: Centavos, desconto: Centavos = 0) {
  const subtotal = itens.reduce((soma, i) => soma + i.precoUnitario * i.quantidade, 0);
  const descontoAplicado = Math.min(desconto, subtotal + frete);
  return { subtotal, frete, desconto: descontoAplicado, total: subtotal + frete - descontoAplicado };
}

/** RN09 — no máximo 10 por produto e nunca acima do disponível. */
export const LIMITE_POR_PRODUTO = 10;
export function quantidadeMaxima(disponivel: number): number {
  return Math.max(0, Math.min(LIMITE_POR_PRODUTO, disponivel));
}
