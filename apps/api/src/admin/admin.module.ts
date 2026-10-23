import { Module } from '@nestjs/common';
import { PedidosModule } from '../pedidos/pedidos.module';
import { AdminCatalogoService } from './admin-catalogo.service';
import { AdminController } from './admin.controller';
import { AdminVendasService } from './admin-vendas.service';

@Module({ imports: [PedidosModule], controllers: [AdminController], providers: [AdminCatalogoService, AdminVendasService] })
export class AdminModule {}
