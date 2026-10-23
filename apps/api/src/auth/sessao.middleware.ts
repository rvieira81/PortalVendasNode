import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { RequisicaoPortal } from '../comum/contexto';
import { iguaisEmTempoConstante, tokenAleatorio } from '../dominio/seguranca';
import { COOKIE_CSRF, COOKIE_SESSAO, SessaoService } from './sessao.service';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ROTAS_SEM_CSRF = ['/api/webhooks/'];

/**
 * 1) CSRF double submit: garante o cookie pv_csrf e exige X-CSRF-Token igual em métodos que alteram dados.
 * 2) Sessão: resolve o usuário do cookie pv_sessao.
 */
@Injectable()
export class SessaoMiddleware implements NestMiddleware {
  constructor(private readonly sessao: SessaoService) {}

  async use(req: RequisicaoPortal, res: Response, next: NextFunction) {
    try {
      let csrf: string | undefined = req.cookies?.[COOKIE_CSRF];
      if (!csrf) {
        csrf = tokenAleatorio(24);
        res.cookie(COOKIE_CSRF, csrf, this.sessao.opcoesCookie(false));
        req.cookies = { ...(req.cookies ?? {}), [COOKIE_CSRF]: csrf };
      }
      const isento = ROTAS_SEM_CSRF.some((r) => req.originalUrl.startsWith(r));
      if (!METODOS_SEGUROS.has(req.method) && !isento) {
        const enviado = req.header('x-csrf-token');
        if (!enviado || !iguaisEmTempoConstante(enviado, csrf)) {
          throw new ForbiddenException({ mensagem: 'Sessão expirada. Recarregue a página e tente de novo.', codigo: 'csrf' });
        }
      }

      const token: string | undefined = req.cookies?.[COOKIE_SESSAO];
      if (token) {
        const usuario = await this.sessao.resolver(token);
        if (usuario) req.usuario = usuario;
        else this.sessao.encerrar(res);
      }
      next();
    } catch (erro) {
      next(erro);
    }
  }
}
