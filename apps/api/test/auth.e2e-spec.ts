import request from 'supertest';
import { codigoTotp, passoAtual } from '../src/dominio/totp';
import { Ambiente, criarAmbiente, novoAdmin, novoCliente, novoCpf, prepararBanco } from './apoio/ambiente';

describe('Contas e autenticação (RF05, RF06, RNF02, RNF05)', () => {
  let amb: Ambiente;
  beforeAll(async () => (amb = await criarAmbiente()));
  beforeEach(() => prepararBanco(amb));
  afterAll(() => amb.fechar());

  const dados = (extra: object = {}) => ({ nome: 'João Souza', email: 'joao@exemplo.com', cpf: novoCpf(), telefone: '11988887777', senha: 'senha12345', aceitouTermos: true, ...extra });

  it('exige o token CSRF em requisições que alteram dados', async () => {
    const r = await request(amb.app.getHttpServer()).post('/api/auth/entrar').send({ email: 'a@b.com', senha: 'x' });
    expect(r.status).toBe(403);
    expect(r.body.codigo).toBe('csrf');
  });

  it('cadastra, envia confirmação e já deixa logado', async () => {
    const nav = await amb.cliente();
    const r = await nav.post('/auth/cadastro', dados());
    expect(r.status).toBe(201);
    expect(r.body.logado).toBe(true);
    expect(amb.email.ultimoToken('joao@exemplo.com')).toBeTruthy();
    const s = await nav.get('/auth/sessao');
    expect(s.body.usuario).toMatchObject({ email: 'joao@exemplo.com', emailConfirmado: false, admin: false });
  });

  it('recusa CPF inválido e termos não aceitos', async () => {
    const nav = await amb.cliente();
    const r = await nav.post('/auth/cadastro', dados({ cpf: '529.982.247-26' }));
    expect(r.status).toBe(400);
    expect(r.body.campos.cpf).toBe('CPF inválido.');
    expect((await nav.post('/auth/cadastro', dados({ aceitouTermos: false }))).status).toBe(400);
  });

  it('não revela se o e-mail já existe', async () => {
    await (await amb.cliente()).post('/auth/cadastro', dados());
    const nav = await amb.cliente();
    const r = await nav.post('/auth/cadastro', dados());
    expect(r.status).toBe(201);
    expect(r.body.logado).toBe(false);
    expect(amb.email.enviados.at(-1)!.assunto).toMatch(/Tentativa de cadastro/);
  });

  it('confirma o e-mail com link de uso único', async () => {
    const c = await novoCliente(amb, { confirmar: false });
    const token = amb.email.ultimoToken(c.email);
    expect((await c.nav.post('/auth/confirmar-email', { token })).status).toBe(200);
    expect((await c.nav.post('/auth/confirmar-email', { token })).status).toBe(422);
    expect((await c.nav.get('/auth/sessao')).body.usuario.emailConfirmado).toBe(true);
  });

  it('bloqueia por 15 minutos após 5 senhas erradas', async () => {
    const c = await novoCliente(amb);
    const nav = await amb.cliente();
    for (let i = 0; i < 4; i++) expect((await nav.post('/auth/entrar', { email: c.email, senha: 'errada123' })).status).toBe(401);
    expect((await nav.post('/auth/entrar', { email: c.email, senha: 'errada123' })).status).toBe(423);
    expect((await nav.post('/auth/entrar', { email: c.email, senha: 'senha12345' })).status).toBe(423);
    amb.relogio.avancarMinutos(16);
    expect((await nav.post('/auth/entrar', { email: c.email, senha: 'senha12345' })).status).toBe(200);
  });

  it('mesma mensagem para e-mail inexistente e senha errada', async () => {
    const c = await novoCliente(amb);
    const nav = await amb.cliente();
    const a = await nav.post('/auth/entrar', { email: 'ninguem@exemplo.com', senha: 'x' });
    const b = await nav.post('/auth/entrar', { email: c.email, senha: 'x' });
    expect(a.body.mensagem).toBe(b.body.mensagem);
  });

  it('redefine a senha e derruba as sessões abertas (RF06)', async () => {
    const c = await novoCliente(amb);
    const outro = await amb.cliente();
    expect((await outro.post('/auth/esqueci-senha', { email: c.email })).status).toBe(200);
    expect((await outro.post('/auth/esqueci-senha', { email: 'nao-existe@x.com' })).status).toBe(200);
    const token = amb.email.ultimoToken(c.email)!;
    expect((await outro.post('/auth/redefinir-senha', { token, senha: 'novaSenha123' })).status).toBe(200);
    expect((await outro.post('/auth/redefinir-senha', { token, senha: 'outraSenha123' })).status).toBe(422);
    expect((await c.nav.get('/conta')).status).toBe(401); // carimbo trocado
    expect((await outro.post('/auth/entrar', { email: c.email, senha: 'novaSenha123' })).status).toBe(200);
  });

  it('link de redefinição expira em 1 hora', async () => {
    const c = await novoCliente(amb);
    await c.nav.post('/auth/esqueci-senha', { email: c.email });
    const token = amb.email.ultimoToken(c.email)!;
    amb.relogio.avancarMinutos(61);
    expect((await c.nav.post('/auth/redefinir-senha', { token, senha: 'novaSenha123' })).status).toBe(422);
  });

  it('cliente não acessa o painel (403) e visitante recebe 401', async () => {
    const c = await novoCliente(amb);
    expect((await c.nav.get('/admin/painel')).status).toBe(403);
    expect((await (await amb.cliente()).get('/admin/painel')).status).toBe(401);
  });

  describe('administrador com 2FA', () => {
    async function adminSemTotp() {
      await amb.pool.query(`INSERT INTO usuario (nome, email, email_confirmado, perfil, senha_hash) VALUES ('Admin', 'adm@loja.com', true, 2, $1)`, [
        await (await import('../src/dominio/seguranca')).gerarHashSenha('SenhaAdmin12345'),
      ]);
      const nav = await amb.cliente();
      const r = await nav.post('/auth/entrar', { email: 'adm@loja.com', senha: 'SenhaAdmin12345' });
      return { nav, r };
    }

    it('exige configurar o autenticador antes de usar o painel', async () => {
      const { nav, r } = await adminSemTotp();
      expect(r.body.proximo).toBe('configurar-2fa');
      expect((await nav.get('/admin/painel')).status).toBe(403);
      expect((await nav.get('/conta')).status).toBe(403);
      const cfg = await nav.get('/auth/2fa/configuracao');
      expect(cfg.body.uri).toMatch(/^otpauth:\/\/totp\//);
      const errado = await nav.post('/auth/2fa/verificar', { codigo: '000000' });
      expect(errado.status).toBe(401);
      const certo = await nav.post('/auth/2fa/verificar', { codigo: codigoTotp(cfg.body.segredo, passoAtual()) });
      expect(certo.status).toBe(200);
      expect((await nav.get('/admin/painel')).status).toBe(200);
      const { rows } = await amb.pool.query(`SELECT totp_segredo_cifrado FROM usuario WHERE email = 'adm@loja.com'`);
      expect(rows[0].totp_segredo_cifrado).not.toContain(cfg.body.segredo);
    });

    it('não aceita o mesmo código TOTP duas vezes', async () => {
      const adm = await novoAdmin(amb);
      const nav = await amb.cliente();
      await nav.post('/auth/entrar', { email: adm.email, senha: 'SenhaAdmin12345' });
      const codigo = codigoTotp(adm.segredo, passoAtual());
      expect((await nav.post('/auth/2fa/verificar', { codigo })).status).toBe(401);
    });
  });
});
