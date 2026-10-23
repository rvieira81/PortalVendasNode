import { Module } from '@nestjs/common';
import { CarrinhoModule } from '../carrinho/carrinho.module';
import { FreteController } from './frete.controller';
import { FreteService } from './frete.service';
import { MelhorEnvioProvedor, ProvedorFrete } from './provedor-frete';

@Module({
  imports: [CarrinhoModule],
  controllers: [FreteController],
  providers: [FreteService, { provide: ProvedorFrete, useClass: MelhorEnvioProvedor }],
  exports: [FreteService],
})
export class FreteModule {}
