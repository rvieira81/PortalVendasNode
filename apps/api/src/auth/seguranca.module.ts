import { Global, Module } from '@nestjs/common';
import { Relogio, RelogioSistema } from '../comum/relogio';
import { SessaoService } from './sessao.service';

@Global()
@Module({
  providers: [{ provide: Relogio, useClass: RelogioSistema }, SessaoService],
  exports: [Relogio, SessaoService],
})
export class SegurancaModule {}
