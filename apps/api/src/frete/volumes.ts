import { ItemCarrinhoDetalhado } from '../carrinho/carrinho.service';
import { VolumeFrete } from './provedor-frete';

export function volumesDoCarrinho(itens: Pick<ItemCarrinhoDetalhado, 'sku' | 'pesoKg' | 'alturaCm' | 'larguraCm' | 'comprimentoCm' | 'precoUnitario' | 'quantidade'>[]): VolumeFrete[] {
  return itens.map((i) => ({
    id: i.sku,
    pesoKg: i.pesoKg,
    alturaCm: i.alturaCm,
    larguraCm: i.larguraCm,
    comprimentoCm: i.comprimentoCm,
    valorUnitario: i.precoUnitario,
    quantidade: i.quantidade,
  }));
}
