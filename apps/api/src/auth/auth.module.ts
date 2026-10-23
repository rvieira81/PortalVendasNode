import { Module } from '@nestjs/common';
import { CarrinhoModule } from '../carrinho/carrinho.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({ imports: [CarrinhoModule], controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
