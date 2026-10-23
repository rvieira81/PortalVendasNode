import { Module } from '@nestjs/common';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { CarrinhoController } from './carrinho.controller';
import { CarrinhoService } from './carrinho.service';

@Module({ imports: [CatalogoModule], controllers: [CarrinhoController], providers: [CarrinhoService], exports: [CarrinhoService] })
export class CarrinhoModule {}
