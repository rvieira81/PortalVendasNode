import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  perfil: number;
  emailConfirmado: boolean;
  mfa: boolean;
  totpAtivo: boolean;
}

export type RequisicaoPortal = Request & { usuario?: UsuarioSessao; id?: string };

export const UsuarioAtual = createParamDecorator((_: unknown, ctx: ExecutionContext): UsuarioSessao | undefined => {
  return ctx.switchToHttp().getRequest<RequisicaoPortal>().usuario;
});

export const PERFIL_CLIENTE = 1;
export const PERFIL_ADMIN = 2;
