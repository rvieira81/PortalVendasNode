import {
  bigint, boolean, char, integer, numeric, pgTable, smallint, text, timestamp, uuid, varchar,
} from 'drizzle-orm/pg-core';

/*
 * Mapeamento do esquema criado por db/migrations (ADR-003).
 * O banco é a fonte da verdade: ao criar um V00N, atualize este arquivo.
 */
const ts = (nome: string) => timestamp(nome, { withTimezone: true, mode: 'date' });
const dinheiro = (nome: string) => numeric(nome, { precision: 12, scale: 2 });

export const categoria = pgTable('categoria', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  nome: varchar('nome', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 120 }).notNull(),
  ativa: boolean('ativa').notNull().default(true),
  criadoEm: ts('criado_em').notNull().defaultNow(),
  alteradoEm: ts('alterado_em'),
});

export const produto = pgTable('produto', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  categoriaId: integer('categoria_id').notNull(),
  sku: varchar('sku', { length: 50 }).notNull(),
  nome: varchar('nome', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 220 }).notNull(),
  descricao: varchar('descricao', { length: 4000 }).notNull().default(''),
  preco: dinheiro('preco').notNull(),
  precoDe: dinheiro('preco_de'),
  estoque: integer('estoque').notNull().default(0),
  estoqueReservado: integer('estoque_reservado').notNull().default(0),
  pesoKg: numeric('peso_kg', { precision: 8, scale: 3 }).notNull(),
  alturaCm: numeric('altura_cm', { precision: 6, scale: 1 }).notNull(),
  larguraCm: numeric('largura_cm', { precision: 6, scale: 1 }).notNull(),
  comprimentoCm: numeric('comprimento_cm', { precision: 6, scale: 1 }).notNull(),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: ts('criado_em').notNull().defaultNow(),
  criadoPor: varchar('criado_por', { length: 100 }).notNull(),
  alteradoEm: ts('alterado_em'),
  alteradoPor: varchar('alterado_por', { length: 100 }),
});

export const produtoImagem = pgTable('produto_imagem', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  produtoId: integer('produto_id').notNull(),
  arquivo: varchar('arquivo', { length: 100 }).notNull(),
  ordem: integer('ordem').notNull().default(0),
});

export const usuario = pgTable('usuario', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  nome: varchar('nome', { length: 150 }).notNull(),
  email: varchar('email', { length: 254 }).notNull(),
  emailConfirmado: boolean('email_confirmado').notNull().default(false),
  cpf: char('cpf', { length: 11 }),
  telefone: varchar('telefone', { length: 11 }),
  perfil: smallint('perfil').notNull(),
  senhaHash: varchar('senha_hash', { length: 200 }).notNull(),
  carimboSeguranca: uuid('carimbo_seguranca').notNull().defaultRandom(),
  falhasLogin: integer('falhas_login').notNull().default(0),
  bloqueadoAte: ts('bloqueado_ate'),
  totpSegredoCifrado: varchar('totp_segredo_cifrado', { length: 300 }),
  totpAtivo: boolean('totp_ativo').notNull().default(false),
  totpUltimoPasso: bigint('totp_ultimo_passo', { mode: 'number' }),
  aceitouTermosEm: ts('aceitou_termos_em'),
  anonimizado: boolean('anonimizado').notNull().default(false),
  ultimoLoginEm: ts('ultimo_login_em'),
  criadoEm: ts('criado_em').notNull().defaultNow(),
  alteradoEm: ts('alterado_em'),
});

export const tokenUsuario = pgTable('token_usuario', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  usuarioId: integer('usuario_id').notNull(),
  tipo: smallint('tipo').notNull(),
  tokenHash: char('token_hash', { length: 64 }).notNull(),
  expiraEm: ts('expira_em').notNull(),
  usadoEm: ts('usado_em'),
  criadoEm: ts('criado_em').notNull().defaultNow(),
});

export const endereco = pgTable('endereco', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  usuarioId: integer('usuario_id').notNull(),
  apelido: varchar('apelido', { length: 50 }).notNull(),
  destinatario: varchar('destinatario', { length: 150 }).notNull(),
  cep: char('cep', { length: 8 }).notNull(),
  logradouro: varchar('logradouro', { length: 200 }).notNull(),
  numero: varchar('numero', { length: 20 }).notNull(),
  complemento: varchar('complemento', { length: 100 }),
  bairro: varchar('bairro', { length: 100 }).notNull(),
  cidade: varchar('cidade', { length: 100 }).notNull(),
  uf: char('uf', { length: 2 }).notNull(),
  padrao: boolean('padrao').notNull().default(false),
  criadoEm: ts('criado_em').notNull().defaultNow(),
  alteradoEm: ts('alterado_em'),
});

export const carrinho = pgTable('carrinho', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  token: uuid('token').notNull().defaultRandom(),
  usuarioId: integer('usuario_id'),
  criadoEm: ts('criado_em').notNull().defaultNow(),
  atualizadoEm: ts('atualizado_em').notNull().defaultNow(),
});

export const carrinhoItem = pgTable('carrinho_item', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  carrinhoId: integer('carrinho_id').notNull(),
  produtoId: integer('produto_id').notNull(),
  quantidade: integer('quantidade').notNull(),
  precoNaInclusao: dinheiro('preco_na_inclusao').notNull(),
});

export const pedido = pgTable('pedido', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  usuarioId: integer('usuario_id').notNull(),
  status: smallint('status').notNull(),
  chaveIdempotencia: uuid('chave_idempotencia').notNull(),
  subtotal: dinheiro('subtotal').notNull(),
  valorFrete: dinheiro('valor_frete').notNull(),
  desconto: dinheiro('desconto').notNull().default('0'),
  total: dinheiro('total').notNull(),
  freteServicoId: integer('frete_servico_id'),
  freteDescricao: varchar('frete_descricao', { length: 150 }).notNull(),
  fretePrazoDias: integer('frete_prazo_dias').notNull(),
  entregaDestinatario: varchar('entrega_destinatario', { length: 150 }).notNull(),
  entregaCep: char('entrega_cep', { length: 8 }).notNull(),
  entregaLogradouro: varchar('entrega_logradouro', { length: 200 }).notNull(),
  entregaNumero: varchar('entrega_numero', { length: 20 }).notNull(),
  entregaComplemento: varchar('entrega_complemento', { length: 100 }),
  entregaBairro: varchar('entrega_bairro', { length: 100 }).notNull(),
  entregaCidade: varchar('entrega_cidade', { length: 100 }).notNull(),
  entregaUf: char('entrega_uf', { length: 2 }).notNull(),
  codigoRastreio: varchar('codigo_rastreio', { length: 50 }),
  expiraEm: ts('expira_em'),
  pagoEm: ts('pago_em'),
  enviadoEm: ts('enviado_em'),
  entregueEm: ts('entregue_em'),
  canceladoEm: ts('cancelado_em'),
  motivoCancelamento: varchar('motivo_cancelamento', { length: 300 }),
  criadoEm: ts('criado_em').notNull().defaultNow(),
  alteradoEm: ts('alterado_em'),
  versao: integer('versao').notNull().default(0),
});

export const pedidoItem = pgTable('pedido_item', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  pedidoId: integer('pedido_id').notNull(),
  produtoId: integer('produto_id').notNull(),
  nomeProduto: varchar('nome_produto', { length: 200 }).notNull(),
  sku: varchar('sku', { length: 50 }).notNull(),
  precoUnitario: dinheiro('preco_unitario').notNull(),
  quantidade: integer('quantidade').notNull(),
  total: dinheiro('total').notNull(),
});

export const pedidoHistorico = pgTable('pedido_historico', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  pedidoId: integer('pedido_id').notNull(),
  statusAnterior: smallint('status_anterior'),
  statusNovo: smallint('status_novo').notNull(),
  observacao: varchar('observacao', { length: 300 }),
  autor: varchar('autor', { length: 100 }).notNull(),
  criadoEm: ts('criado_em').notNull().defaultNow(),
});

export const pagamento = pgTable('pagamento', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  pedidoId: integer('pedido_id').notNull(),
  metodo: smallint('metodo').notNull(),
  status: smallint('status').notNull(),
  statusGateway: varchar('status_gateway', { length: 30 }),
  statusDetalhe: varchar('status_detalhe', { length: 100 }),
  gatewayId: bigint('gateway_id', { mode: 'number' }),
  chaveIdempotencia: uuid('chave_idempotencia').notNull(),
  valor: dinheiro('valor').notNull(),
  parcelas: integer('parcelas'),
  bandeira: varchar('bandeira', { length: 30 }),
  ultimosDigitos: char('ultimos_digitos', { length: 4 }),
  pixQrCode: varchar('pix_qr_code', { length: 1000 }),
  pixQrCodeBase64: text('pix_qr_code_base64'),
  boletoUrl: varchar('boleto_url', { length: 500 }),
  boletoLinhaDigitavel: varchar('boleto_linha_digitavel', { length: 60 }),
  expiraEm: ts('expira_em'),
  criadoEm: ts('criado_em').notNull().defaultNow(),
  alteradoEm: ts('alterado_em'),
});

export const notificacaoGateway = pgTable('notificacao_gateway', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  requestId: varchar('request_id', { length: 100 }),
  topico: varchar('topico', { length: 50 }).notNull(),
  recursoId: varchar('recurso_id', { length: 50 }).notNull(),
  corpo: text('corpo'),
  assinaturaValida: boolean('assinatura_valida').notNull(),
  processada: boolean('processada').notNull().default(false),
  erro: varchar('erro', { length: 1000 }),
  recebidaEm: ts('recebida_em').notNull().defaultNow(),
  processadaEm: ts('processada_em'),
});

export const faixaFrete = pgTable('faixa_frete', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  descricao: varchar('descricao', { length: 100 }).notNull(),
  cepInicio: char('cep_inicio', { length: 8 }).notNull(),
  cepFim: char('cep_fim', { length: 8 }).notNull(),
  valor: dinheiro('valor').notNull(),
  prazoDias: integer('prazo_dias').notNull(),
  ativa: boolean('ativa').notNull().default(true),
  criadoEm: ts('criado_em').notNull().defaultNow(),
  alteradoEm: ts('alterado_em'),
});

export const configuracao = pgTable('configuracao', {
  chave: varchar('chave', { length: 100 }).primaryKey(),
  valor: varchar('valor', { length: 500 }).notNull(),
  alteradoEm: ts('alterado_em'),
  alteradoPor: varchar('alterado_por', { length: 100 }),
});
