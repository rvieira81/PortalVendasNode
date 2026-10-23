import { Module } from '@nestjs/common';
import { ContasController } from './contas.controller';
import { ContasService } from './contas.service';
import { ServicoCep, ViaCepService } from './cep.service';

@Module({
  controllers: [ContasController],
  providers: [ContasService, { provide: ServicoCep, useClass: ViaCepService }],
  exports: [ContasService],
})
export class ContasModule {}
