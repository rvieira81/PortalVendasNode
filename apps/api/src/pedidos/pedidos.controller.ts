import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { UsuarioAtual, UsuarioSessao } from '../comum/contexto';
import { idParam, Validar } from '../comum/zod';
import { Autenticado } from '../auth/acesso.guard';
import { PedidosService } from './pedidos.service';

const novoPedido = z.object({
  enderecoId: z.number().int().positive(),
  freteCodigo: z.string().regex(/^(me|faixa)-\d+$/),
  chaveIdempotencia: z.string().uuid(),
});

@ApiTags('Pedidos')
@Controller('pedidos')
@Autenticado()
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async criar(@UsuarioAtual() u: UsuarioSessao, @Body(new Validar(novoPedido)) dados: z.infer<typeof novoPedido>) {
    const { id } = await this.pedidos.criar(u, dados);
    return this.pedidos.detalhe(id, u.id);
  }

  @Get()
  listar(@UsuarioAtual() u: UsuarioSessao) {
    return this.pedidos.listar(u.id);
  }

  @Get(':id')
  detalhe(@UsuarioAtual() u: UsuarioSessao, @Param('id', new Validar(idParam)) id: number) {
    return this.pedidos.detalhe(id, u.id);
  }

  @Post(':id/cancelar')
  cancelar(@UsuarioAtual() u: UsuarioSessao, @Param('id', new Validar(idParam)) id: number) {
    return this.pedidos.cancelar(id, `cliente:${u.id}`, 'Cancelado pelo cliente', u.id);
  }
}
