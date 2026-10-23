import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CookieOptions, Response } from 'express';
import { Config, CONFIG } from '../config/config';
import { Relogio } from '../comum/relogio';
import { UsuarioSessao } from '../comum/contexto';
import { Banco, BANCO } from '../db/db';
import { usuario } from '../db/schema';
import { assinar, verificarAssinado } from '../dominio/seguranca';

export const COOKIE_SESSAO = 'pv_sessao';
export const COOKIE_CSRF = 'pv_csrf';
export const COOKIE_CARRINHO = 'pv_carrinho';

interface ConteudoSessao {
  uid: number;
  c: string; // carimbo de segurança
  mfa: boolean;
  exp: number; // epoch ms
}

@Injectable()
export class SessaoService {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(BANCO) private readonly db: Banco,
    private readonly relogio: Relogio,
  ) {}

  opcoesCookie(httpOnly = true, maxAgeMs?: number): CookieOptions {
    return { httpOnly, secure: this.config.cookieSeguro, sameSite: 'lax', path: '/', maxAge: maxAgeMs };
  }

  emitir(res: Response, usuarioId: number, carimbo: string, mfa: boolean) {
    const duracao = this.config.SESSAO_HORAS * 3_600_000;
    const conteudo: ConteudoSessao = { uid: usuarioId, c: carimbo, mfa, exp: this.relogio.agora().getTime() + duracao };
    res.cookie(COOKIE_SESSAO, assinar(conteudo, this.config.SESSAO_SEGREDO), this.opcoesCookie(true, duracao));
  }

  encerrar(res: Response) {
    res.clearCookie(COOKIE_SESSAO, this.opcoesCookie(true));
  }

  /** Valida o cookie e confere no banco o carimbo de segurança (revogação imediata — ADR-004). */
  async resolver(token: string | undefined): Promise<UsuarioSessao | null> {
    const conteudo = verificarAssinado<ConteudoSessao>(token, this.config.SESSAO_SEGREDO);
    if (!conteudo || conteudo.exp < this.relogio.agora().getTime()) return null;
    const [u] = await this.db
      .select({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        emailConfirmado: usuario.emailConfirmado,
        carimbo: usuario.carimboSeguranca,
        anonimizado: usuario.anonimizado,
        totpAtivo: usuario.totpAtivo,
      })
      .from(usuario)
      .where(eq(usuario.id, conteudo.uid));
    if (!u || u.anonimizado || u.carimbo !== conteudo.c) return null;
    return {
      id: u.id,
      nome: u.nome,
      email: u.email,
      perfil: u.perfil,
      emailConfirmado: u.emailConfirmado,
      mfa: conteudo.mfa,
      totpAtivo: u.totpAtivo,
    };
  }
}
