import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import TestAgent from 'supertest/lib/agent';
import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/app.factory';
import { Relogio } from '../../src/comum/relogio';
import { ServicoCep } from '../../src/contas/cep.service';
import { POOL } from '../../src/db/db';
import { cifrar, gerarHashSenha } from '../../src/dominio/seguranca';
import { codigoTotp, gerarSegredoTotp, passoAtual } from '../../src/dominio/totp';
import { EnvioEmail } from '../../src/email/email.service';
import { ProvedorFrete } from '../../src/frete/provedor-frete';
import { GatewayPagamento } from '../../src/pagamentos/gateway';
import { ManutencaoService } from '../../src/manutencao/manutencao.service';
import { configTeste, SEGREDO_WEBHOOK } from './config-teste';
import { CepFalso, EmailMemoria, FreteFalso, GatewayFalso, RelogioFalso } from './falsos';

export interface Ambiente {
  app: INestApplication;
  pool: Pool;
  email: EmailMemoria;
  frete: FreteFalso;
  gateway: GatewayFalso;
  relogio: RelogioFalso;
  manutencao: ManutencaoService;
  config: ReturnType<typeof configTeste>;
  cliente: () => Promise<Navegador>;
  fechar: () => Promise<void>;
}

/** Simula o navegador: guarda cookies e manda o X-CSRF-Token como o front faz. */
export class Navegador {
  csrf = '';
  constructor(readonly agente: TestAgent) {}

  async iniciar() {
    const r = await this.agente.get('/api/auth/sessao');
    const cookie = ([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith('pv_csrf='));
    this.csrf = decodeURIComponent(cookie!.split(';')[0].split('=')[1]);
    return this;
  }

  get(url: string) {
    return this.agente.get(`/api${url}`);
  }
  post(url: string, corpo?: object) {
    return this.agente.post(`/api${url}`).set('X-CSRF-Token', this.csrf).send(corpo);
  }
  put(url: string, corpo?: object) {
    return this.agente.put(`/api${url}`).set('X-CSRF-Token', this.csrf).send(corpo);
  }
  patch(url: string, corpo?: object) {
    return this.agente.patch(`/api${url}`).set('X-CSRF-Token', this.csrf).send(corpo);
  }
  delete(url: string) {
    return this.agente.delete(`/api${url}`).set('X-CSRF-Token', this.csrf);
  }
}

export async function criarAmbiente(): Promise<Ambiente> {
  const config = configTeste();
  const email = new EmailMemoria();
  const frete = new FreteFalso();
  const gateway = new GatewayFalso();
  const relogio = new RelogioFalso();
  const modulo = await Test.createTestingModule({ imports: [AppModule.com(config)] })
    .overrideProvider(EnvioEmail).useValue(email)
    .overrideProvider(ProvedorFrete).useValue(frete)
    .overrideProvider(GatewayPagamento).useValue(gateway)
    .overrideProvider(ServicoCep).useValue(new CepFalso())
    .overrideProvider(Relogio).useValue(relogio)
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  configurarApp(app, config);
  await app.init();
  const pool = app.get<Pool>(POOL);
  return {
    app,
    pool,
    email,
    frete,
    gateway,
    relogio,
    config,
    manutencao: app.get(ManutencaoService),
    cliente: () => new Navegador(request.agent(app.getHttpServer())).iniciar(),
    fechar: () => app.close(),
  };
}

/** Banco limpo, configuração padrão e catálogo mínimo. */
export async function prepararBanco(amb: Ambiente) {
  amb.email.enviados = [];
  amb.gateway.pagamentos.clear();
  amb.gateway.estornos = [];
  amb.gateway.criados = [];
  amb.gateway.proximo = { status: 'pending' };
  amb.gateway.falharCriacao = false;
  amb.frete.ativo = true;
  amb.frete.falhar = false;
  amb.relogio.deslocamentoMs = 0;
  await amb.pool.query(`
    TRUNCATE notificacao_gateway, pagamento, pedido_historico, pedido_item, pedido, carrinho_item, carrinho,
             endereco, token_usuario, usuario, produto_imagem, produto, categoria, faixa_frete RESTART IDENTITY CASCADE;
    UPDATE configuracao SET valor = CASE chave
      WHEN 'frete.cep_origem' THEN '13270000' WHEN 'frete.dias_manuseio' THEN '1' WHEN 'frete.gratis_a_partir_de' THEN '0'
      WHEN 'pagamento.parcelas_maximas' THEN '12' WHEN 'pagamento.parcela_minima' THEN '10.00' ELSE valor END;
    INSERT INTO categoria (nome, slug) VALUES ('Eletrônicos', 'eletronicos'), ('Casa', 'casa'), ('Arquivada', 'arquivada');
    UPDATE categoria SET ativa = false WHERE slug = 'arquivada';
    INSERT INTO produto (categoria_id, sku, nome, slug, descricao, preco, preco_de, estoque, peso_kg, altura_cm, largura_cm, comprimento_cm, ativo, criado_por) VALUES
      (1, 'FONE', 'Fone Bluetooth', 'fone', 'Fone sem fio', 199.90, 249.90, 5, 0.35, 8, 18, 20, true, 'teste'),
      (1, 'CABO', 'Cabo USB-C', 'cabo', 'Cabo reforçado', 29.90, NULL, 100, 0.1, 2, 10, 15, true, 'teste'),
      (2, 'CAFE', 'Cafeteira Elétrica', 'cafeteira', 'Faz café', 159.90, NULL, 2, 2.1, 32, 22, 28, true, 'teste'),
      (2, 'ESGO', 'Panela Esgotada', 'panela', 'Sem estoque', 99.90, NULL, 0, 1, 10, 10, 10, true, 'teste'),
      (2, 'INAT', 'Produto Inativo', 'inativo', '', 10.00, NULL, 10, 1, 10, 10, 10, false, 'teste'),
      (3, 'ARQV', 'Produto de Categoria Arquivada', 'arquivado', '', 10.00, NULL, 10, 1, 10, 10, 10, true, 'teste');
    INSERT INTO faixa_frete (descricao, cep_inicio, cep_fim, valor, prazo_dias) VALUES ('Interior SP', '10000000', '19999999', 24.90, 5);
  `);
}

export const IDS = { fone: 1, cabo: 2, cafe: 3, esgotado: 4, inativo: 5, arquivado: 6 };

let sequenciaCpf = 0;
/** Gera CPFs válidos diferentes para cada cadastro. */
export function novoCpf() {
  const base = String(100000000 + ++sequenciaCpf * 7919).slice(0, 9).split('').map(Number);
  const dv = (n: number[]) => {
    const soma = n.reduce((s, d, i) => s + d * (n.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}

export interface ClienteLogado {
  nav: Navegador;
  email: string;
  id: number;
}

/** Cadastra, confirma o e-mail e devolve o navegador já logado. */
export async function novoCliente(amb: Ambiente, opcoes: { confirmar?: boolean; email?: string } = {}): Promise<ClienteLogado> {
  const nav = await amb.cliente();
  const email = opcoes.email ?? `cliente-${randomUUID().slice(0, 8)}@exemplo.com`;
  const r = await nav.post('/auth/cadastro', { nome: 'Maria Silva', email, cpf: novoCpf(), telefone: '19999991234', senha: 'senha12345', aceitouTermos: true });
  if (r.status !== 201) throw new Error(`cadastro falhou: ${r.status} ${JSON.stringify(r.body)}`);
  if (opcoes.confirmar !== false) {
    const token = amb.email.ultimoToken(email);
    await nav.post('/auth/confirmar-email', { token });
  }
  const { rows } = await amb.pool.query('SELECT id FROM usuario WHERE email = $1', [email]);
  return { nav, email, id: rows[0].id };
}

export async function novoEndereco(nav: Navegador, cep = '13270000') {
  const r = await nav.post('/conta/enderecos', { apelido: 'Casa', destinatario: 'Maria Silva', cep, logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Valinhos', uf: 'SP' });
  return r.body.id as number;
}

/** Carrinho → endereço → frete → pedido. Devolve o corpo do pedido criado. */
export async function novoPedido(c: ClienteLogado, itens: [number, number][] = [[IDS.fone, 1]], freteCodigo = 'me-1') {
  for (const [produtoId, quantidade] of itens) await c.nav.post('/carrinho/itens', { produtoId, quantidade });
  const enderecoId = await novoEndereco(c.nav);
  const r = await c.nav.post('/pedidos', { enderecoId, freteCodigo, chaveIdempotencia: randomUUID() });
  if (r.status !== 201) throw new Error(`pedido falhou: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

/** Administrador com 2FA já configurado, logado e verificado. */
export async function novoAdmin(amb: Ambiente) {
  const segredo = gerarSegredoTotp();
  const email = `admin-${randomUUID().slice(0, 6)}@loja.com`;
  await amb.pool.query(
    `INSERT INTO usuario (nome, email, email_confirmado, perfil, senha_hash, totp_segredo_cifrado, totp_ativo) VALUES ('Admin', $1, true, 2, $2, $3, true)`,
    [email, await gerarHashSenha('SenhaAdmin12345'), cifrar(segredo, amb.config.CHAVE_CIFRAGEM)],
  );
  const nav = await amb.cliente();
  await nav.post('/auth/entrar', { email, senha: 'SenhaAdmin12345' });
  const r = await nav.post('/auth/2fa/verificar', { codigo: codigoTotp(segredo, passoAtual()) });
  if (r.status !== 200) throw new Error(`2FA falhou: ${JSON.stringify(r.body)}`);
  return { nav, email, segredo };
}

/** Notificação do Mercado Pago assinada como no painel de webhooks. */
export function notificar(amb: Ambiente, pagamentoId: number, opcoes: { requestId?: string; segredo?: string } = {}) {
  const requestId = opcoes.requestId ?? randomUUID();
  const ts = String(Date.now());
  const v1 = createHmac('sha256', opcoes.segredo ?? SEGREDO_WEBHOOK).update(`id:${pagamentoId};request-id:${requestId};ts:${ts};`).digest('hex');
  return request(amb.app.getHttpServer())
    .post(`/api/webhooks/mercadopago?data.id=${pagamentoId}&type=payment`)
    .set('x-signature', `ts=${ts},v1=${v1}`)
    .set('x-request-id', requestId)
    .send({ action: 'payment.updated', type: 'payment', data: { id: String(pagamentoId) } });
}

export async function estoque(amb: Ambiente, produtoId: number) {
  const { rows } = await amb.pool.query('SELECT estoque, estoque_reservado AS reservado FROM produto WHERE id = $1', [produtoId]);
  return rows[0] as { estoque: number; reservado: number };
}
