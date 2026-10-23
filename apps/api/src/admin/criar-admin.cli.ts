/*
 * Cria (ou promove) um administrador:
 *   npm run criar-admin -w apps/api -- admin@sualoja.com.br "Nome do Administrador"
 * A senha é pedida sem eco (mínimo 12 caracteres). No primeiro login o painel pede o autenticador (2FA).
 * Em contêiner: docker compose exec api node dist/admin/criar-admin.cli.js email "Nome"
 */
import { eq, sql } from 'drizzle-orm';
import { createInterface } from 'node:readline';
import { carregarConfig } from '../config/config';
import { carregarEnvLocal } from '../config/env-local';
import { criarBanco, criarPool } from '../db/db';
import { usuario } from '../db/schema';
import { gerarHashSenha } from '../dominio/seguranca';
import { validarForcaSenha } from '../auth/auth.service';
import { PERFIL_ADMIN } from '../comum/contexto';
import { descreverErro } from '../db/erro-conexao';

function lerSenha(pergunta: string): Promise<string> {
  if (process.env.ADMIN_SENHA) return Promise.resolve(process.env.ADMIN_SENHA);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      const rl = createInterface({ input: stdin });
      rl.once('line', (linha) => {
        rl.close();
        resolve(linha.trim());
      });
      process.stdout.write(pergunta);
      return;
    }
    process.stdout.write(pergunta);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let senha = '';
    const aoDigitar = (c: string) => {
      if (c === '\r' || c === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', aoDigitar);
        process.stdout.write('\n');
        resolve(senha);
      } else if (c === '\u0003') {
        process.exit(1);
      } else if (c === '\u0008' || c === '\u007f') {
        if (senha.length) {
          senha = senha.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        senha += c;
        process.stdout.write('*');
      }
    };
    stdin.on('data', aoDigitar);
  });
}

async function principal() {
  carregarEnvLocal();
  const [email, ...nomePartes] = process.argv.slice(2);
  const nome = nomePartes.join(' ').trim();
  if (!email || !nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Uso: npm run criar-admin -w apps/api -- email@dominio.com "Nome do Administrador"');
    process.exit(1);
  }
  const senha = await lerSenha('Senha (mínimo 12 caracteres, letras e números): ');
  const confirmacao = process.env.ADMIN_SENHA ? senha : await lerSenha('Confirme a senha: ');
  if (senha !== confirmacao) throw new Error('As senhas não conferem.');
  validarForcaSenha(senha, PERFIL_ADMIN);

  const config = carregarConfig();
  const pool = criarPool(config.DATABASE_URL, 1);
  try {
    const db = criarBanco(pool);
    const emailMin = email.toLowerCase();
    const hash = await gerarHashSenha(senha);
    const [existente] = await db.select({ id: usuario.id }).from(usuario).where(eq(usuario.email, emailMin));
    if (existente) {
      await db
        .update(usuario)
        .set({ nome, perfil: PERFIL_ADMIN, senhaHash: hash, emailConfirmado: true, totpAtivo: false, totpSegredoCifrado: null, totpUltimoPasso: null, carimboSeguranca: sql`gen_random_uuid()`, falhasLogin: 0, bloqueadoAte: null })
        .where(eq(usuario.id, existente.id));
      console.log(`Usuário ${emailMin} atualizado como administrador. Configure o autenticador no próximo login.`);
    } else {
      await db.insert(usuario).values({ nome, email: emailMin, perfil: PERFIL_ADMIN, senhaHash: hash, emailConfirmado: true });
      console.log(`Administrador ${emailMin} criado. Entre em /conta/entrar e configure o autenticador.`);
    }
  } finally {
    await pool.end();
  }
}

principal().catch((erro) => {
  console.error(descreverErro(erro));
  process.exit(1);
});
