import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { z } from 'zod';
import { RequisicaoPortal } from '../comum/contexto';
import { idParam, Validar } from '../comum/zod';
import { COOKIE_CARRINHO, SessaoService } from '../auth/sessao.service';
import { CarrinhoService, DonoCarrinho } from './carrinho.service';

const novoItem = z.object({ produtoId: z.number().int().positive(), quantidade: z.number().int().min(1).max(10).default(1) });
const quantidade = z.object({ quantidade: z.number().int().min(1, 'Quantidade mínima é 1.').max(10, 'Máximo de 10 por produto.') });

@ApiTags('Carrinho')
@Controller('carrinho')
export class CarrinhoController {
  constructor(
    private readonly carrinho: CarrinhoService,
    private readonly sessao: SessaoService,
  ) {}

  private dono(req: RequisicaoPortal): DonoCarrinho {
    return req.usuario ? { usuarioId: req.usuario.id } : { token: req.cookies?.[COOKIE_CARRINHO] };
  }

  private guardarToken(res: Response, token?: string) {
    if (token) res.cookie(COOKIE_CARRINHO, token, this.sessao.opcoesCookie(true, 30 * 24 * 3_600_000));
  }

  @Get()
  ver(@Req() req: RequisicaoPortal) {
    return this.carrinho.ver(this.dono(req));
  }

  @Post('itens')
  async adicionar(@Req() req: RequisicaoPortal, @Res({ passthrough: true }) res: Response, @Body(new Validar(novoItem)) corpo: z.infer<typeof novoItem>) {
    const r = await this.carrinho.definir(this.dono(req), corpo.produtoId, corpo.quantidade, true);
    this.guardarToken(res, r.token);
    return { ...(await this.carrinho.ver(r.token ? { token: r.token } : this.dono(req))), aviso: r.aviso };
  }

  @Patch('itens/:produtoId')
  async alterar(
    @Req() req: RequisicaoPortal,
    @Res({ passthrough: true }) res: Response,
    @Param('produtoId', new Validar(idParam)) produtoId: number,
    @Body(new Validar(quantidade)) corpo: z.infer<typeof quantidade>,
  ) {
    const r = await this.carrinho.definir(this.dono(req), produtoId, corpo.quantidade, false);
    this.guardarToken(res, r.token);
    return { ...(await this.carrinho.ver(r.token ? { token: r.token } : this.dono(req))), aviso: r.aviso };
  }

  @Delete('itens/:produtoId')
  async remover(@Req() req: RequisicaoPortal, @Param('produtoId', new Validar(idParam)) produtoId: number) {
    await this.carrinho.remover(this.dono(req), produtoId);
    return this.carrinho.ver(this.dono(req));
  }
}
