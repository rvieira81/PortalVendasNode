import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { Config, CONFIG } from '../config/config';
import { ErroNegocio, NaoAutorizado } from '../comum/erros';
import { PERFIL_ADMIN, PERFIL_CLIENTE } from '../comum/contexto';
import { Relogio } from '../comum/relogio';
import { Banco, BANCO } from '../db/db';
import { tokenUsuario, usuario } from '../db/schema';
import { cpfValido, somenteDigitos } from '../dominio/cpf';
import { cifrar, decifrar, gerarHashSenha, sha256Hex, tokenAleatorio, verificarSenha } from '../dominio/seguranca';
import { gerarSegredoTotp, uriOtpAuth, verificarTotp } from '../dominio/totp';
import { EmailService } from '../email/email.service';

export const TOKEN_CONFIRMACAO = 1;
export const TOKEN_REDEFINICAO = 2;
const MAX_FALHAS = 5;
const BLOQUEIO_MIN = 15;
// Hash fixo para gastar o mesmo tempo quando o e-mail não existe (não revela contas)
const HASH_FALSO = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

export interface DadosCadastro {
  nome: string;
  email: string;
  cpf: string;
  telefone: string;
  senha: string;
  aceitouTermos: boolean;
}

export interface UsuarioLogado {
  id: number;
  carimbo: string;
  perfil: number;
  totpAtivo: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(BANCO) private readonly db: Banco,
    @Inject(CONFIG) private readonly config: Config,
    private readonly relogio: Relogio,
    private readonly email: EmailService,
  ) {}

  /** RF05 — e-mail já cadastrado recebe a mesma resposta (não confirma se a conta existe). */
  async cadastrar(dados: DadosCadastro): Promise<UsuarioLogado | null> {
    const email = dados.email.trim().toLowerCase();
    const cpf = somenteDigitos(dados.cpf);
    if (!cpfValido(cpf)) throw new ErroNegocio('CPF inválido.', HttpStatus.BAD_REQUEST, { campos: { cpf: 'CPF inválido.' } });
    if (!dados.aceitouTermos) throw new ErroNegocio('É preciso aceitar os termos de uso e a política de privacidade.', HttpStatus.BAD_REQUEST);

    const [existente] = await this.db.select({ id: usuario.id }).from(usuario).where(eq(usuario.email, email));
    if (existente) {
      await this.email.cadastroExistente(email);
      return null;
    }
    const [cpfEmUso] = await this.db.select({ id: usuario.id }).from(usuario).where(eq(usuario.cpf, cpf));
    if (cpfEmUso) {
      throw new ErroNegocio('Não foi possível concluir o cadastro com estes dados. Se você já tem conta, entre ou recupere a senha.');
    }

    const [novo] = await this.db
      .insert(usuario)
      .values({
        nome: dados.nome.trim(),
        email,
        cpf,
        telefone: somenteDigitos(dados.telefone),
        perfil: PERFIL_CLIENTE,
        senhaHash: await gerarHashSenha(dados.senha),
        aceitouTermosEm: this.relogio.agora(),
        ultimoLoginEm: this.relogio.agora(),
      })
      .onConflictDoNothing()
      .returning();
    if (!novo) return null; // corrida entre dois cadastros com o mesmo e-mail
    await this.enviarConfirmacao(novo.id, novo.email, novo.nome);
    return { id: novo.id, carimbo: novo.carimboSeguranca, perfil: novo.perfil, totpAtivo: false };
  }

  async enviarConfirmacao(usuarioId: number, email: string, nome: string) {
    const token = await this.criarToken(usuarioId, TOKEN_CONFIRMACAO, 24 * 60);
    await this.email.confirmacaoEmail(email, nome, token);
  }

  async confirmarEmail(token: string) {
    const registro = await this.consumirToken(token, TOKEN_CONFIRMACAO);
    if (!registro) throw new ErroNegocio('Link inválido ou expirado. Peça um novo e-mail de confirmação.');
    await this.db.update(usuario).set({ emailConfirmado: true, alteradoEm: this.relogio.agora() }).where(eq(usuario.id, registro.usuarioId));
  }

  /** RF05 — 5 falhas seguidas bloqueiam por 15 minutos. Mensagem única para e-mail ou senha errados. */
  async entrar(emailInformado: string, senha: string): Promise<UsuarioLogado> {
    const email = emailInformado.trim().toLowerCase();
    const agora = this.relogio.agora();
    const [u] = await this.db.select().from(usuario).where(eq(usuario.email, email));
    if (!u || u.anonimizado) {
      await verificarSenha(senha, HASH_FALSO);
      throw new NaoAutorizado('E-mail ou senha incorretos.');
    }
    if (u.bloqueadoAte && u.bloqueadoAte > agora) {
      throw new ErroNegocio('Conta bloqueada temporariamente por excesso de tentativas. Tente de novo em alguns minutos.', HttpStatus.LOCKED);
    }
    if (!(await verificarSenha(senha, u.senhaHash))) {
      const falhas = u.falhasLogin + 1;
      const bloquear = falhas >= MAX_FALHAS;
      await this.db
        .update(usuario)
        .set({ falhasLogin: bloquear ? 0 : falhas, bloqueadoAte: bloquear ? new Date(agora.getTime() + BLOQUEIO_MIN * 60_000) : null })
        .where(eq(usuario.id, u.id));
      this.logger.warn(`Falha de login (usuário ${u.id}, tentativa ${falhas})`);
      if (bloquear) throw new ErroNegocio('Conta bloqueada por 15 minutos após 5 tentativas incorretas.', HttpStatus.LOCKED);
      throw new NaoAutorizado('E-mail ou senha incorretos.');
    }
    await this.db.update(usuario).set({ falhasLogin: 0, bloqueadoAte: null, ultimoLoginEm: agora }).where(eq(usuario.id, u.id));
    this.logger.log(`Login (usuário ${u.id}, perfil ${u.perfil})`);
    return { id: u.id, carimbo: u.carimboSeguranca, perfil: u.perfil, totpAtivo: u.totpAtivo };
  }

  /* ---------------- 2FA do administrador ---------------- */

  /** Gera (ou reaproveita, se ainda não ativado) o segredo para configurar o autenticador. */
  async iniciarConfiguracaoTotp(usuarioId: number) {
    const [u] = await this.db.select().from(usuario).where(eq(usuario.id, usuarioId));
    if (!u || u.perfil !== PERFIL_ADMIN) throw new NaoAutorizado();
    if (u.totpAtivo) throw new ErroNegocio('O autenticador já está configurado.', HttpStatus.CONFLICT);
    let segredo = u.totpSegredoCifrado ? decifrar(u.totpSegredoCifrado, this.config.CHAVE_CIFRAGEM) : null;
    if (!segredo) {
      segredo = gerarSegredoTotp();
      await this.db.update(usuario).set({ totpSegredoCifrado: cifrar(segredo, this.config.CHAVE_CIFRAGEM) }).where(eq(usuario.id, u.id));
    }
    return { segredo, uri: uriOtpAuth(segredo, u.email, this.config.NOME_LOJA) };
  }

  /** Confere o código; na primeira vez ativa o 2FA. Um código já usado não vale de novo. */
  async verificarTotp(usuarioId: number, codigo: string): Promise<UsuarioLogado> {
    const [u] = await this.db.select().from(usuario).where(eq(usuario.id, usuarioId));
    if (!u || u.perfil !== PERFIL_ADMIN || !u.totpSegredoCifrado) throw new ErroNegocio('Configure o autenticador primeiro.');
    const segredo = decifrar(u.totpSegredoCifrado, this.config.CHAVE_CIFRAGEM);
    const passo = verificarTotp(segredo, codigo, u.totpUltimoPasso ?? null, this.relogio.agora().getTime());
    if (passo === null) {
      this.logger.warn(`Código 2FA incorreto (usuário ${u.id})`);
      throw new ErroNegocio('Código incorreto ou já usado. Confira o horário do celular e use o próximo código.', HttpStatus.UNAUTHORIZED);
    }
    // Ativar o 2FA troca o carimbo: sessões abertas antes disso deixam de valer
    const ativando = !u.totpAtivo;
    const [atualizado] = await this.db
      .update(usuario)
      .set({
        totpAtivo: true,
        totpUltimoPasso: passo,
        ...(ativando ? { carimboSeguranca: sql`gen_random_uuid()` } : {}),
      })
      .where(and(eq(usuario.id, u.id), sql`coalesce(${usuario.totpUltimoPasso}, -1) < ${passo}`))
      .returning();
    if (!atualizado) throw new ErroNegocio('Código já usado. Aguarde o próximo.', HttpStatus.UNAUTHORIZED);
    return { id: atualizado.id, carimbo: atualizado.carimboSeguranca, perfil: atualizado.perfil, totpAtivo: true };
  }

  /* ---------------- Senha ---------------- */

  /** RF06 — sempre responde igual; o link vale 1 hora e é de uso único. */
  async esqueciSenha(emailInformado: string) {
    const email = emailInformado.trim().toLowerCase();
    const [u] = await this.db.select().from(usuario).where(eq(usuario.email, email));
    if (!u || u.anonimizado) return;
    const token = await this.criarToken(u.id, TOKEN_REDEFINICAO, 60);
    await this.email.redefinicaoSenha(u.email, u.nome, token);
  }

  async redefinirSenha(token: string, novaSenha: string) {
    const registro = await this.consumirToken(token, TOKEN_REDEFINICAO);
    if (!registro) throw new ErroNegocio('Link inválido ou expirado. Peça uma nova redefinição.');
    const [u] = await this.db.select({ perfil: usuario.perfil }).from(usuario).where(eq(usuario.id, registro.usuarioId));
    validarForcaSenha(novaSenha, u?.perfil ?? PERFIL_CLIENTE);
    await this.db
      .update(usuario)
      .set({
        senhaHash: await gerarHashSenha(novaSenha),
        carimboSeguranca: sql`gen_random_uuid()`,
        falhasLogin: 0,
        bloqueadoAte: null,
        emailConfirmado: true, // quem abriu o link provou ter acesso ao e-mail
        alteradoEm: this.relogio.agora(),
      })
      .where(eq(usuario.id, registro.usuarioId));
  }

  /* ---------------- Tokens de e-mail (só o SHA-256 vai para o banco) ---------------- */

  private async criarToken(usuarioId: number, tipo: number, validadeMin: number) {
    const token = tokenAleatorio(32);
    await this.db.insert(tokenUsuario).values({
      usuarioId,
      tipo,
      tokenHash: sha256Hex(token),
      expiraEm: new Date(this.relogio.agora().getTime() + validadeMin * 60_000),
    });
    return token;
  }

  private async consumirToken(token: string, tipo: number) {
    if (!token || token.length > 100) return null;
    const agora = this.relogio.agora();
    const [registro] = await this.db
      .update(tokenUsuario)
      .set({ usadoEm: agora })
      .where(
        and(
          eq(tokenUsuario.tokenHash, sha256Hex(token)),
          eq(tokenUsuario.tipo, tipo),
          isNull(tokenUsuario.usadoEm),
          gt(tokenUsuario.expiraEm, agora),
        ),
      )
      .returning();
    return registro ?? null;
  }
}

export function validarForcaSenha(senha: string, perfil: number) {
  const minimo = perfil === PERFIL_ADMIN ? 12 : 8;
  if (senha.length < minimo) throw new ErroNegocio(`A senha precisa de pelo menos ${minimo} caracteres.`, HttpStatus.BAD_REQUEST);
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) throw new ErroNegocio('Use letras e números na senha.', HttpStatus.BAD_REQUEST);
}
