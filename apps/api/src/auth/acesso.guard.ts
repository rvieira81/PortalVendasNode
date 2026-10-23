import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NaoAutorizado, Proibido } from '../comum/erros';
import { PERFIL_ADMIN, RequisicaoPortal } from '../comum/contexto';

type Acesso = 'cliente' | 'admin' | 'admin-sem-mfa';
const CHAVE = 'acesso';

/** Exige usuário logado (qualquer perfil). */
export const Autenticado = () => SetMetadata(CHAVE, 'cliente' satisfies Acesso);
/** Exige administrador que já passou pelo segundo fator (RNF05). */
export const SomenteAdmin = () => SetMetadata(CHAVE, 'admin' satisfies Acesso);
/** Administrador logado com senha, ainda sem o segundo fator (telas de 2FA). */
export const AdminSemMfa = () => SetMetadata(CHAVE, 'admin-sem-mfa' satisfies Acesso);

@Injectable()
export class AcessoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const acesso = this.reflector.getAllAndOverride<Acesso | undefined>(CHAVE, [ctx.getHandler(), ctx.getClass()]);
    if (!acesso) return true;
    const usuario = ctx.switchToHttp().getRequest<RequisicaoPortal>().usuario;
    if (!usuario) throw new NaoAutorizado();
    if (acesso === 'cliente') {
      // Administrador sem 2FA concluído não usa nada além das telas de 2FA
      if (usuario.perfil === PERFIL_ADMIN && !usuario.mfa) throw new Proibido('Conclua a verificação em duas etapas.');
      return true;
    }
    if (usuario.perfil !== PERFIL_ADMIN) throw new Proibido();
    if (acesso === 'admin' && !usuario.mfa) throw new Proibido('Conclua a verificação em duas etapas.');
    return true;
  }
}
