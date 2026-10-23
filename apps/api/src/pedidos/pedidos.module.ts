import { Module } from '@nestjs/common';
import { CarrinhoModule } from '../carrinho/carrinho.module';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { FreteModule } from '../frete/frete.module';
import { PedidoEstadoService } from './pedido-estado.service';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

@Module({
  imports: [CarrinhoModule, CatalogoModule, FreteModule],
  controllers: [PedidosController],
  providers: [PedidosService, PedidoEstadoService],
  exports: [PedidosService, PedidoEstadoService],
})
export class PedidosModule {}
