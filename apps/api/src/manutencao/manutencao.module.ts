import { Module } from '@nestjs/common';
import { PagamentosModule } from '../pagamentos/pagamentos.module';
import { ManutencaoService } from './manutencao.service';

@Module({ imports: [PagamentosModule], providers: [ManutencaoService], exports: [ManutencaoService] })
export class ManutencaoModule {}
