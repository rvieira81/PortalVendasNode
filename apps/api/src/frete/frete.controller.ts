import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { RequisicaoPortal } from '../comum/contexto';
import { ErroNegocio } from '../comum/erros';
import { Validar } from '../comum/zod';
import { COOKIE_CARRINHO } from '../auth/sessao.service';
import { CarrinhoService } from '../carrinho/carrinho.service';
import { paraReais } from '../dominio/dinheiro';
import { FreteService } from './frete.service';
import { volumesDoCarrinho } from './volumes';

@ApiTags('Frete')
@Controller('frete')
export class FreteController {
  constructor(
    private readonly frete: FreteService,
    private readonly carrinho: CarrinhoService,
  ) {}

  /** Cota o frete do carrinho atual para um CEP. */
  @Post('cotacao')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async cotar(@Req() req: RequisicaoPortal, @Body(new Validar(z.object({ cep: z.string().trim().max(9) }))) corpo: { cep: string }) {
    const dono = req.usuario ? { usuarioId: req.usuario.id } : { token: req.cookies?.[COOKIE_CARRINHO] };
    const itens = (await this.carrinho.itens(dono)).filter((i) => i.ativo);
    if (!itens.length) throw new ErroNegocio('O carrinho está vazio.');
    const subtotal = itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0);
    const opcoes = await this.frete.cotar(corpo.cep, volumesDoCarrinho(itens), subtotal);
    return opcoes.map((o) => ({ ...o, valor: paraReais(o.valor) }));
  }
}
