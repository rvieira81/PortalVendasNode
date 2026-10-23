import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { z } from 'zod';
import { UsuarioAtual, UsuarioSessao } from '../comum/contexto';
import { idParam, Validar } from '../comum/zod';
import { Autenticado } from '../auth/acesso.guard';
import { PedidosService } from '../pedidos/pedidos.service';
import { PagamentosService } from './pagamentos.service';

const dadosPagamento = z.discriminatedUnion('metodo', [
  z.object({ metodo: z.literal('pix') }),
  z.object({ metodo: z.literal('boleto') }),
  z.object({
    metodo: z.literal('cartao'),
    cartao: z.object({
      token: z.string().min(10).max(200),
      parcelas: z.number().int().min(1).max(12),
      paymentMethodId: z.string().min(2).max(40),
      issuerId: z.union([z.string(), z.number()]).transform(String).optional(),
    }),
  }),
]);

@ApiTags('Pagamentos')
@Controller()
export class PagamentosController {
  constructor(
    private readonly pagamentos: PagamentosService,
    private readonly pedidos: PedidosService,
  ) {}

  @Get('pagamentos/config')
  configuracao() {
    return this.pagamentos.configuracaoPublica();
  }

  @Post('pedidos/:id/pagamento')
  @HttpCode(200)
  @Autenticado()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  pagar(@UsuarioAtual() u: UsuarioSessao, @Param('id', new Validar(idParam)) id: number, @Body(new Validar(dadosPagamento)) dados: z.infer<typeof dadosPagamento>) {
    return this.pagamentos.iniciar(u, id, dados);
  }

  /** Consulta leve usada pela tela de pagamento para atualizar sozinha (RF10). */
  @Get('pedidos/:id/status')
  @Autenticado()
  @SkipThrottle()
  async status(@UsuarioAtual() u: UsuarioSessao, @Param('id', new Validar(idParam)) id: number) {
    const d = await this.pedidos.detalhe(id, u.id);
    return { status: d.status, statusDescricao: d.statusDescricao, pagamento: d.pagamento ? { status: d.pagamento.status, statusDetalhe: d.pagamento.statusDetalhe } : null };
  }

  /** Webhook do Mercado Pago (isento de CSRF; autenticado pela assinatura x-signature). */
  @Post('webhooks/mercadopago')
  @ApiExcludeEndpoint()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async webhook(@Req() req: Request, @Res() res: Response, @Query() query: Record<string, string>, @Body() corpo: Record<string, unknown>) {
    const dados = (corpo?.data ?? {}) as { id?: string | number };
    const { status } = await this.pagamentos.receberNotificacao({
      assinatura: req.header('x-signature'),
      requestId: req.header('x-request-id'),
      tipo: String(query['type'] ?? query['topic'] ?? corpo?.type ?? corpo?.topic ?? ''),
      dataId: String(query['data.id'] ?? query['id'] ?? dados.id ?? ''),
      corpo,
    });
    res.status(status).end();
  }
}
