import { Inject, Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import nodemailer, { Transporter } from 'nodemailer';
import { Config, CONFIG } from '../config/config';

export interface Mensagem {
  para: string;
  assunto: string;
  html: string;
}

/** Porta de saída de e-mail: nos testes entra uma implementação em memória. */
export abstract class EnvioEmail {
  abstract enviar(mensagem: Mensagem): Promise<void>;
}

@Injectable()
export class EnvioEmailSmtp extends EnvioEmail {
  private readonly logger = new Logger('Email');
  private transporte?: Transporter;

  constructor(@Inject(CONFIG) private readonly config: Config) {
    super();
  }

  async enviar({ para, assunto, html }: Mensagem): Promise<void> {
    if (this.config.EMAIL_PASTA) {
      // Desenvolvimento: grava o .eml em disco em vez de enviar
      const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
      const info = await t.sendMail({ from: this.config.SMTP_REMETENTE, to: para, subject: assunto, html });
      const pasta = resolve(this.config.EMAIL_PASTA);
      await mkdir(pasta, { recursive: true });
      const nome = `${new Date().toISOString().replace(/[:.]/g, '-')}-${para.replace(/[^a-z0-9@._-]/gi, '_')}.eml`;
      await writeFile(join(pasta, nome), info.message as Buffer);
      this.logger.log(`E-mail "${assunto}" gravado em ${join(pasta, nome)}`);
      return;
    }
    if (!this.config.SMTP_HOST) {
      this.logger.warn(`SMTP não configurado: e-mail "${assunto}" não enviado`);
      return;
    }
    this.transporte ??= nodemailer.createTransport({
      host: this.config.SMTP_HOST,
      port: this.config.SMTP_PORTA,
      secure: this.config.SMTP_PORTA === 465,
      requireTLS: this.config.SMTP_PORTA !== 465,
      auth: this.config.SMTP_USUARIO ? { user: this.config.SMTP_USUARIO, pass: this.config.SMTP_SENHA } : undefined,
    });
    await this.transporte.sendMail({ from: this.config.SMTP_REMETENTE, to: para, subject: assunto, html });
  }
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Textos dos e-mails transacionais (RF15). Falha de envio nunca interrompe o fluxo. */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');

  constructor(
    private readonly envio: EnvioEmail,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  private layout(titulo: string, corpo: string, botao?: { texto: string; url: string }) {
    const acao = botao
      ? `<p style="margin:28px 0"><a href="${esc(botao.url)}" style="background:#0f766e;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">${esc(botao.texto)}</a></p>`
      : '';
    return `<!doctype html><html lang="pt-BR"><body style="font-family:Segoe UI,Arial,sans-serif;background:#f6f5f1;padding:24px;color:#1f2933">
<div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:28px">
<h2 style="margin-top:0;color:#0f766e">${esc(this.config.NOME_LOJA)}</h2><h3>${esc(titulo)}</h3>${corpo}${acao}
<p style="color:#6b7280;font-size:12px;margin-top:32px">Você recebeu este e-mail porque tem uma conta em ${esc(this.config.NOME_LOJA)}.</p></div></body></html>`;
  }

  private async enviar(para: string, assunto: string, html: string) {
    try {
      await this.envio.enviar({ para, assunto, html });
    } catch (erro) {
      this.logger.error({ err: erro }, `Falha ao enviar "${assunto}"`);
    }
  }

  confirmacaoEmail(para: string, nome: string, token: string) {
    const url = `${this.config.URL_SITE}/conta/confirmar-email?token=${encodeURIComponent(token)}`;
    return this.enviar(para, 'Confirme seu e-mail', this.layout(`Olá, ${nome}!`, '<p>Confirme seu e-mail para poder finalizar compras. O link vale por 24 horas.</p>', { texto: 'Confirmar e-mail', url }));
  }

  cadastroExistente(para: string) {
    const url = `${this.config.URL_SITE}/conta/esqueci-senha`;
    return this.enviar(para, 'Tentativa de cadastro com seu e-mail', this.layout('Você já tem uma conta', '<p>Alguém tentou criar uma conta com este e-mail. Se foi você, entre normalmente ou redefina a senha. Se não foi, ignore esta mensagem.</p>', { texto: 'Redefinir senha', url }));
  }

  redefinicaoSenha(para: string, nome: string, token: string) {
    const url = `${this.config.URL_SITE}/conta/redefinir-senha?token=${encodeURIComponent(token)}`;
    return this.enviar(para, 'Redefinição de senha', this.layout(`Olá, ${nome}`, '<p>Recebemos um pedido para redefinir sua senha. O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail.</p>', { texto: 'Criar nova senha', url }));
  }

  pedido(para: string, nome: string, pedidoId: number, titulo: string, texto: string) {
    const url = `${this.config.URL_SITE}/conta/pedidos/${pedidoId}`;
    return this.enviar(para, `Pedido #${pedidoId}: ${titulo}`, this.layout(`Olá, ${nome}`, `<p>${esc(texto)}</p>`, { texto: 'Ver pedido', url }));
  }
}
