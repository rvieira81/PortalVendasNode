import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { z } from 'zod';
import { PERFIL_ADMIN, RequisicaoPortal, UsuarioAtual, UsuarioSessao } from '../comum/contexto';
import { texto, Validar } from '../comum/zod';
import { CarrinhoService } from '../carrinho/carrinho.service';
import { AdminSemMfa, Autenticado } from './acesso.guard';
import { AuthService, UsuarioLogado, validarForcaSenha } from './auth.service';
import { COOKIE_CARRINHO, SessaoService } from './sessao.service';

const email = z.string({ error: 'Informe o e-mail.' }).trim().toLowerCase().email('E-mail inválido.').max(254);

const cadastro = z.object({
  nome: texto(150, 'Nome').refine((n) => n.includes(' '), 'Informe nome e sobrenome.'),
  email,
  cpf: z.string().trim().max(14),
  telefone: z.string().trim().refine((t) => /^\d{10,11}$/.test(t.replace(/\D/g, '')), 'Telefone com DDD, só números.'),
  senha: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.').max(128),
  aceitouTermos: z.boolean(),
});
const login = z.object({ email, senha: z.string().min(1, 'Informe a senha.').max(128) });
const token = z.object({ token: z.string().min(10).max(100) });
const redefinir = z.object({ token: z.string().min(10).max(100), senha: z.string().min(8).max(128) });
const codigo = z.object({ codigo: z.string().trim().regex(/^\d{6}$/, 'Digite os 6 números do autenticador.') });

const LIMITE_SENSIVEL = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessao: SessaoService,
    private readonly carrinho: CarrinhoService,
  ) {}

  /** Usuário atual (ou null). Também garante o cookie de CSRF para o front. */
  @Get('sessao')
  sessaoAtual(@UsuarioAtual() usuario?: UsuarioSessao) {
    if (!usuario) return { usuario: null };
    const admin = usuario.perfil === PERFIL_ADMIN;
    return {
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        admin,
        emailConfirmado: usuario.emailConfirmado,
        pendente2fa: admin && !usuario.mfa ? (usuario.totpAtivo ? 'verificar' : 'configurar') : null,
      },
    };
  }

  private async abrirSessao(req: RequisicaoPortal, res: Response, u: UsuarioLogado, mfa: boolean) {
    this.sessao.emitir(res, u.id, u.carimbo, mfa);
    if (u.perfil !== PERFIL_ADMIN) {
      await this.carrinho.mesclar(req.cookies?.[COOKIE_CARRINHO], u.id);
      res.clearCookie(COOKIE_CARRINHO, this.sessao.opcoesCookie(true));
    }
  }

  @Post('cadastro')
  @Throttle(LIMITE_SENSIVEL)
  async cadastrar(@Req() req: RequisicaoPortal, @Res({ passthrough: true }) res: Response, @Body(new Validar(cadastro)) dados: z.infer<typeof cadastro>) {
    validarForcaSenha(dados.senha, 1);
    const u = await this.auth.cadastrar(dados);
    if (u) await this.abrirSessao(req, res, u, false);
    return {
      mensagem: 'Enviamos um link de confirmação para o seu e-mail. Confirme para poder finalizar compras.',
      logado: Boolean(u),
    };
  }

  @Post('entrar')
  @HttpCode(200)
  @Throttle(LIMITE_SENSIVEL)
  async entrar(@Req() req: RequisicaoPortal, @Res({ passthrough: true }) res: Response, @Body(new Validar(login)) dados: z.infer<typeof login>) {
    const u = await this.auth.entrar(dados.email, dados.senha);
    await this.abrirSessao(req, res, u, false);
    if (u.perfil === PERFIL_ADMIN) return { proximo: u.totpAtivo ? 'verificar-2fa' : 'configurar-2fa' };
    return { proximo: 'loja' };
  }

  @Post('sair')
  @HttpCode(204)
  sair(@Res({ passthrough: true }) res: Response) {
    this.sessao.encerrar(res);
  }

  @Post('confirmar-email')
  @HttpCode(200)
  async confirmarEmail(@Body(new Validar(token)) corpo: z.infer<typeof token>) {
    await this.auth.confirmarEmail(corpo.token);
    return { mensagem: 'E-mail confirmado. Obrigado!' };
  }

  @Post('reenviar-confirmacao')
  @HttpCode(200)
  @Autenticado()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  async reenviar(@UsuarioAtual() usuario: UsuarioSessao) {
    if (!usuario.emailConfirmado) await this.auth.enviarConfirmacao(usuario.id, usuario.email, usuario.nome);
    return { mensagem: 'Se o e-mail ainda não foi confirmado, enviamos um novo link.' };
  }

  @Post('esqueci-senha')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  async esqueci(@Body(new Validar(z.object({ email }))) corpo: { email: string }) {
    await this.auth.esqueciSenha(corpo.email);
    return { mensagem: 'Se houver uma conta com este e-mail, você vai receber o link para criar uma nova senha.' };
  }

  @Post('redefinir-senha')
  @HttpCode(200)
  @Throttle(LIMITE_SENSIVEL)
  async redefinir(@Res({ passthrough: true }) res: Response, @Body(new Validar(redefinir)) corpo: z.infer<typeof redefinir>) {
    await this.auth.redefinirSenha(corpo.token, corpo.senha);
    this.sessao.encerrar(res);
    return { mensagem: 'Senha alterada. Entre com a nova senha.' };
  }

  @Get('2fa/configuracao')
  @AdminSemMfa()
  configurar2fa(@UsuarioAtual() usuario: UsuarioSessao) {
    return this.auth.iniciarConfiguracaoTotp(usuario.id);
  }

  @Post('2fa/verificar')
  @HttpCode(200)
  @AdminSemMfa()
  @Throttle(LIMITE_SENSIVEL)
  async verificar2fa(@Res({ passthrough: true }) res: Response, @UsuarioAtual() usuario: UsuarioSessao, @Body(new Validar(codigo)) corpo: z.infer<typeof codigo>) {
    const u = await this.auth.verificarTotp(usuario.id, corpo.codigo);
    this.sessao.emitir(res, u.id, u.carimbo, true);
    return { proximo: 'admin' };
  }
}
