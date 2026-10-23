/* =====================================================================
   PortalVendasNode — V001 — Criação inicial do esquema (PostgreSQL 16)
   Convenções:
     - Tabelas no singular, snake_case, esquema public
     - PK "id" (integer identity; bigint nas tabelas de log)
     - FK "<tabela>_id"
     - Datas em timestamptz (UTC); o front exibe em America/Sao_Paulo
     - Valores monetários numeric(12,2)
     - Nomes de constraints: pk_, fk_, uq_, ck_, ix_
   ===================================================================== */

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() não é IMMUTABLE; este invólucro permite usá-la em índice.
CREATE OR REPLACE FUNCTION f_sem_acento(texto text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, texto)) $$;

/* ---------------------------------------------------------------------
   Catálogo
   --------------------------------------------------------------------- */
CREATE TABLE categoria (
    id           integer GENERATED ALWAYS AS IDENTITY,
    nome         varchar(100) NOT NULL,
    slug         varchar(120) NOT NULL,
    ativa        boolean      NOT NULL DEFAULT true,
    criado_em    timestamptz  NOT NULL DEFAULT now(),
    alterado_em  timestamptz,
    CONSTRAINT pk_categoria PRIMARY KEY (id),
    CONSTRAINT uq_categoria_nome UNIQUE (nome),
    CONSTRAINT uq_categoria_slug UNIQUE (slug)
);

CREATE TABLE produto (
    id                 integer GENERATED ALWAYS AS IDENTITY,
    categoria_id       integer        NOT NULL,
    sku                varchar(50)    NOT NULL,
    nome               varchar(200)   NOT NULL,
    slug               varchar(220)   NOT NULL,
    descricao          varchar(4000)  NOT NULL DEFAULT '',
    preco              numeric(12,2)  NOT NULL,
    preco_de           numeric(12,2),            -- preço "de" riscado na vitrine
    estoque            integer        NOT NULL DEFAULT 0,
    estoque_reservado  integer        NOT NULL DEFAULT 0,
    peso_kg            numeric(8,3)   NOT NULL,
    altura_cm          numeric(6,1)   NOT NULL,
    largura_cm         numeric(6,1)   NOT NULL,
    comprimento_cm     numeric(6,1)   NOT NULL,
    ativo              boolean        NOT NULL DEFAULT true,
    criado_em          timestamptz    NOT NULL DEFAULT now(),
    criado_por         varchar(100)   NOT NULL,
    alterado_em        timestamptz,
    alterado_por       varchar(100),
    CONSTRAINT pk_produto PRIMARY KEY (id),
    CONSTRAINT fk_produto_categoria FOREIGN KEY (categoria_id) REFERENCES categoria (id),
    CONSTRAINT uq_produto_sku  UNIQUE (sku),
    CONSTRAINT uq_produto_slug UNIQUE (slug),
    CONSTRAINT ck_produto_preco             CHECK (preco > 0),
    CONSTRAINT ck_produto_preco_de          CHECK (preco_de IS NULL OR preco_de > preco),
    CONSTRAINT ck_produto_estoque           CHECK (estoque >= 0),
    CONSTRAINT ck_produto_estoque_reservado CHECK (estoque_reservado >= 0 AND estoque_reservado <= estoque),  -- RN03
    CONSTRAINT ck_produto_dimensoes         CHECK (peso_kg > 0 AND altura_cm > 0 AND largura_cm > 0 AND comprimento_cm > 0)
);
CREATE INDEX ix_produto_categoria_id ON produto (categoria_id);
-- Vitrine: WHERE ativo [AND categoria_id = $1] [AND preco BETWEEN ...] ORDER BY preco
CREATE INDEX ix_produto_vitrine ON produto (categoria_id, preco) WHERE ativo;
-- Vitrine sem filtro, "mais recentes"
CREATE INDEX ix_produto_recentes ON produto (criado_em DESC) WHERE ativo;
-- Busca sem diferenciar maiúsculas e acentos (RF02): f_sem_acento(nome || descricao) LIKE '%termo%'
CREATE INDEX ix_produto_busca ON produto USING gin (f_sem_acento(nome || ' ' || descricao) gin_trgm_ops);

CREATE TABLE produto_imagem (
    id          integer GENERATED ALWAYS AS IDENTITY,
    produto_id  integer      NOT NULL,
    arquivo     varchar(100) NOT NULL,   -- nome gerado (UUID + extensão), nunca o nome enviado
    ordem       integer      NOT NULL DEFAULT 0,
    CONSTRAINT pk_produto_imagem PRIMARY KEY (id),
    CONSTRAINT fk_produto_imagem_produto FOREIGN KEY (produto_id) REFERENCES produto (id) ON DELETE CASCADE
);
CREATE INDEX ix_produto_imagem_produto_id ON produto_imagem (produto_id, ordem);

/* ---------------------------------------------------------------------
   Usuários (clientes e administradores)
   --------------------------------------------------------------------- */
CREATE TABLE usuario (
    id                      integer GENERATED ALWAYS AS IDENTITY,
    nome                    varchar(150) NOT NULL,
    email                   varchar(254) NOT NULL,      -- sempre em minúsculas
    email_confirmado        boolean      NOT NULL DEFAULT false,
    cpf                     char(11),                   -- LGPD: mascarado em respostas e logs
    telefone                varchar(11),                -- LGPD
    perfil                  smallint     NOT NULL,      -- 1 Cliente, 2 Administrador
    senha_hash              varchar(200) NOT NULL,      -- scrypt$N$r$p$sal$hash
    carimbo_seguranca       uuid         NOT NULL DEFAULT gen_random_uuid(),  -- muda: invalida sessões
    falhas_login            integer      NOT NULL DEFAULT 0,
    bloqueado_ate           timestamptz,
    totp_segredo_cifrado    varchar(300),               -- AES-256-GCM
    totp_ativo              boolean      NOT NULL DEFAULT false,
    totp_ultimo_passo       bigint,                     -- impede reuso do mesmo código
    aceitou_termos_em       timestamptz,
    anonimizado             boolean      NOT NULL DEFAULT false,
    ultimo_login_em         timestamptz,
    criado_em               timestamptz  NOT NULL DEFAULT now(),
    alterado_em             timestamptz,
    CONSTRAINT pk_usuario PRIMARY KEY (id),
    CONSTRAINT uq_usuario_email UNIQUE (email),
    CONSTRAINT ck_usuario_email_minusculo CHECK (email = lower(email)),
    CONSTRAINT ck_usuario_perfil CHECK (perfil IN (1, 2)),
    CONSTRAINT ck_usuario_cpf CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
    CONSTRAINT ck_usuario_telefone CHECK (telefone IS NULL OR telefone ~ '^[0-9]{10,11}$')
);
-- CPF único só entre quem tem CPF (administradores e contas anonimizadas ficam sem)
CREATE UNIQUE INDEX uq_usuario_cpf ON usuario (cpf) WHERE cpf IS NOT NULL;

CREATE TABLE token_usuario (
    id          integer GENERATED ALWAYS AS IDENTITY,
    usuario_id  integer     NOT NULL,
    tipo        smallint    NOT NULL,   -- 1 Confirmação de e-mail, 2 Redefinição de senha
    token_hash  char(64)    NOT NULL,   -- SHA-256 hex; o token em si nunca é gravado
    expira_em   timestamptz NOT NULL,
    usado_em    timestamptz,
    criado_em   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_token_usuario PRIMARY KEY (id),
    CONSTRAINT fk_token_usuario_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT uq_token_usuario_token_hash UNIQUE (token_hash),
    CONSTRAINT ck_token_usuario_tipo CHECK (tipo IN (1, 2))
);
CREATE INDEX ix_token_usuario_usuario_id ON token_usuario (usuario_id, tipo);
CREATE INDEX ix_token_usuario_expira_em ON token_usuario (expira_em);

CREATE TABLE endereco (
    id            integer GENERATED ALWAYS AS IDENTITY,
    usuario_id    integer      NOT NULL,
    apelido       varchar(50)  NOT NULL,   -- "Casa", "Trabalho"
    destinatario  varchar(150) NOT NULL,
    cep           char(8)      NOT NULL,
    logradouro    varchar(200) NOT NULL,
    numero        varchar(20)  NOT NULL,
    complemento   varchar(100),
    bairro        varchar(100) NOT NULL,
    cidade        varchar(100) NOT NULL,
    uf            char(2)      NOT NULL,
    padrao        boolean      NOT NULL DEFAULT false,
    criado_em     timestamptz  NOT NULL DEFAULT now(),
    alterado_em   timestamptz,
    CONSTRAINT pk_endereco PRIMARY KEY (id),
    CONSTRAINT fk_endereco_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT ck_endereco_cep CHECK (cep ~ '^[0-9]{8}$'),
    CONSTRAINT ck_endereco_uf  CHECK (uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
                                             'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'))
);
CREATE INDEX ix_endereco_usuario_id ON endereco (usuario_id);
-- No máximo um endereço padrão por usuário
CREATE UNIQUE INDEX uq_endereco_padrao ON endereco (usuario_id) WHERE padrao;

/* ---------------------------------------------------------------------
   Carrinho
   --------------------------------------------------------------------- */
CREATE TABLE carrinho (
    id             integer GENERATED ALWAYS AS IDENTITY,
    token          uuid        NOT NULL DEFAULT gen_random_uuid(),   -- cookie do carrinho anônimo
    usuario_id     integer,
    criado_em      timestamptz NOT NULL DEFAULT now(),
    atualizado_em  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_carrinho PRIMARY KEY (id),
    CONSTRAINT fk_carrinho_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT uq_carrinho_token UNIQUE (token)
);
CREATE UNIQUE INDEX uq_carrinho_usuario_id ON carrinho (usuario_id) WHERE usuario_id IS NOT NULL;
-- Limpeza de carrinhos anônimos abandonados
CREATE INDEX ix_carrinho_anonimo_atualizado_em ON carrinho (atualizado_em) WHERE usuario_id IS NULL;

CREATE TABLE carrinho_item (
    id                 integer GENERATED ALWAYS AS IDENTITY,
    carrinho_id        integer       NOT NULL,
    produto_id         integer       NOT NULL,
    quantidade         integer       NOT NULL,
    preco_na_inclusao  numeric(12,2) NOT NULL,   -- para avisar quando o preço mudar
    CONSTRAINT pk_carrinho_item PRIMARY KEY (id),
    CONSTRAINT fk_carrinho_item_carrinho FOREIGN KEY (carrinho_id) REFERENCES carrinho (id) ON DELETE CASCADE,
    CONSTRAINT fk_carrinho_item_produto  FOREIGN KEY (produto_id)  REFERENCES produto (id),
    CONSTRAINT uq_carrinho_item_carrinho_produto UNIQUE (carrinho_id, produto_id),
    CONSTRAINT ck_carrinho_item_quantidade CHECK (quantidade BETWEEN 1 AND 10)   -- RN09
);
CREATE INDEX ix_carrinho_item_produto_id ON carrinho_item (produto_id);

/* ---------------------------------------------------------------------
   Pedidos
   --------------------------------------------------------------------- */
CREATE TABLE pedido (
    id                    integer GENERATED ALWAYS AS IDENTITY (START WITH 1001),
    usuario_id            integer       NOT NULL,
    status                smallint      NOT NULL,
    chave_idempotencia    uuid          NOT NULL,     -- RF09: duplo clique não cria dois pedidos
    subtotal              numeric(12,2) NOT NULL,
    valor_frete           numeric(12,2) NOT NULL,
    desconto              numeric(12,2) NOT NULL DEFAULT 0,
    total                 numeric(12,2) NOT NULL,
    frete_servico_id      integer,                    -- id do serviço no Melhor Envio; NULL = contingência
    frete_descricao       varchar(150)  NOT NULL,
    frete_prazo_dias      integer       NOT NULL,
    -- Endereço copiado no momento da compra (o cliente pode alterar ou excluir o endereço depois)
    entrega_destinatario  varchar(150)  NOT NULL,
    entrega_cep           char(8)       NOT NULL,
    entrega_logradouro    varchar(200)  NOT NULL,
    entrega_numero        varchar(20)   NOT NULL,
    entrega_complemento   varchar(100),
    entrega_bairro        varchar(100)  NOT NULL,
    entrega_cidade        varchar(100)  NOT NULL,
    entrega_uf            char(2)       NOT NULL,
    codigo_rastreio       varchar(50),
    expira_em             timestamptz,                -- prazo para pagar
    pago_em               timestamptz,
    enviado_em            timestamptz,
    entregue_em           timestamptz,
    cancelado_em          timestamptz,
    motivo_cancelamento   varchar(300),
    criado_em             timestamptz   NOT NULL DEFAULT now(),
    alterado_em           timestamptz,
    versao                integer       NOT NULL DEFAULT 0,   -- concorrência otimista
    CONSTRAINT pk_pedido PRIMARY KEY (id),
    CONSTRAINT fk_pedido_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id),
    CONSTRAINT uq_pedido_chave_idempotencia UNIQUE (chave_idempotencia),
    -- 1 AguardandoPagamento, 2 PagamentoEmAnalise, 3 Pago, 4 EmSeparacao, 5 Enviado, 6 Entregue, 9 Cancelado
    CONSTRAINT ck_pedido_status  CHECK (status IN (1, 2, 3, 4, 5, 6, 9)),
    CONSTRAINT ck_pedido_valores CHECK (subtotal > 0 AND valor_frete >= 0 AND desconto >= 0 AND total >= 0),
    CONSTRAINT ck_pedido_total   CHECK (total = subtotal + valor_frete - desconto),   -- RN05
    CONSTRAINT ck_pedido_entrega_cep CHECK (entrega_cep ~ '^[0-9]{8}$')
);
CREATE INDEX ix_pedido_usuario_id_criado_em ON pedido (usuario_id, criado_em DESC);  -- Meus pedidos
CREATE INDEX ix_pedido_status_criado_em ON pedido (status, criado_em DESC);          -- Admin: status + período
CREATE INDEX ix_pedido_criado_em ON pedido (criado_em);                              -- Admin: período / painel
CREATE INDEX ix_pedido_expiracao ON pedido (expira_em) WHERE status IN (1, 2);       -- Job de expiração

CREATE TABLE pedido_item (
    id              integer GENERATED ALWAYS AS IDENTITY,
    pedido_id       integer       NOT NULL,
    produto_id      integer       NOT NULL,
    nome_produto    varchar(200)  NOT NULL,   -- cópia: o produto pode ser renomeado
    sku             varchar(50)   NOT NULL,
    preco_unitario  numeric(12,2) NOT NULL,   -- RN01
    quantidade      integer       NOT NULL,
    total           numeric(12,2) NOT NULL,
    CONSTRAINT pk_pedido_item PRIMARY KEY (id),
    CONSTRAINT fk_pedido_item_pedido  FOREIGN KEY (pedido_id)  REFERENCES pedido (id) ON DELETE CASCADE,
    CONSTRAINT fk_pedido_item_produto FOREIGN KEY (produto_id) REFERENCES produto (id),
    CONSTRAINT ck_pedido_item_quantidade CHECK (quantidade > 0),
    CONSTRAINT ck_pedido_item_total CHECK (total = preco_unitario * quantidade)
);
CREATE INDEX ix_pedido_item_pedido_id  ON pedido_item (pedido_id);
CREATE INDEX ix_pedido_item_produto_id ON pedido_item (produto_id);

CREATE TABLE pedido_historico (
    id               bigint GENERATED ALWAYS AS IDENTITY,
    pedido_id        integer      NOT NULL,
    status_anterior  smallint,
    status_novo      smallint     NOT NULL,
    observacao       varchar(300),
    autor            varchar(100) NOT NULL,   -- e-mail do admin, "cliente:{id}", "sistema" ou "mercadopago"
    criado_em        timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_pedido_historico PRIMARY KEY (id),
    CONSTRAINT fk_pedido_historico_pedido FOREIGN KEY (pedido_id) REFERENCES pedido (id) ON DELETE CASCADE
);
CREATE INDEX ix_pedido_historico_pedido_id ON pedido_historico (pedido_id, criado_em);

/* ---------------------------------------------------------------------
   Pagamentos
   --------------------------------------------------------------------- */
CREATE TABLE pagamento (
    id                      integer GENERATED ALWAYS AS IDENTITY,
    pedido_id               integer       NOT NULL,
    metodo                  smallint      NOT NULL,   -- 1 Pix, 2 Cartão de crédito, 3 Boleto
    -- 1 Pendente, 2 EmAnalise, 3 Aprovado, 4 Recusado, 5 Cancelado, 6 Estornado, 7 Contestado
    status                  smallint      NOT NULL,
    status_gateway          varchar(30),
    status_detalhe          varchar(100),
    gateway_id              bigint,                   -- id do pagamento no Mercado Pago
    chave_idempotencia      uuid          NOT NULL,   -- X-Idempotency-Key
    valor                   numeric(12,2) NOT NULL,
    parcelas                integer,
    bandeira                varchar(30),
    ultimos_digitos         char(4),                  -- nunca o número do cartão
    pix_qr_code             varchar(1000),
    pix_qr_code_base64      text,
    boleto_url              varchar(500),
    boleto_linha_digitavel  varchar(60),
    expira_em               timestamptz,
    criado_em               timestamptz   NOT NULL DEFAULT now(),
    alterado_em             timestamptz,
    CONSTRAINT pk_pagamento PRIMARY KEY (id),
    CONSTRAINT fk_pagamento_pedido FOREIGN KEY (pedido_id) REFERENCES pedido (id),
    CONSTRAINT uq_pagamento_chave_idempotencia UNIQUE (chave_idempotencia),
    CONSTRAINT ck_pagamento_metodo CHECK (metodo IN (1, 2, 3)),
    CONSTRAINT ck_pagamento_status CHECK (status BETWEEN 1 AND 7),
    CONSTRAINT ck_pagamento_valor  CHECK (valor > 0),
    CONSTRAINT ck_pagamento_parcelas CHECK (parcelas IS NULL OR parcelas BETWEEN 1 AND 12)   -- RN06
);
CREATE UNIQUE INDEX uq_pagamento_gateway_id ON pagamento (gateway_id) WHERE gateway_id IS NOT NULL;
CREATE INDEX ix_pagamento_pedido_id ON pagamento (pedido_id);
CREATE INDEX ix_pagamento_pendentes ON pagamento (criado_em) WHERE status IN (1, 2);   -- conciliação

CREATE TABLE notificacao_gateway (
    id                 bigint GENERATED ALWAYS AS IDENTITY,
    request_id         varchar(100),      -- x-request-id (deduplicação)
    topico             varchar(50)  NOT NULL,
    recurso_id         varchar(50)  NOT NULL,
    corpo              text,
    assinatura_valida  boolean      NOT NULL,
    processada         boolean      NOT NULL DEFAULT false,
    erro               varchar(1000),
    recebida_em        timestamptz  NOT NULL DEFAULT now(),
    processada_em      timestamptz,
    CONSTRAINT pk_notificacao_gateway PRIMARY KEY (id)
);
CREATE UNIQUE INDEX uq_notificacao_gateway_request_id ON notificacao_gateway (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX ix_notificacao_gateway_recebida_em ON notificacao_gateway (recebida_em);

/* ---------------------------------------------------------------------
   Frete e configurações
   --------------------------------------------------------------------- */
CREATE TABLE faixa_frete (
    id           integer GENERATED ALWAYS AS IDENTITY,
    descricao    varchar(100)  NOT NULL,
    cep_inicio   char(8)       NOT NULL,
    cep_fim      char(8)       NOT NULL,
    valor        numeric(12,2) NOT NULL,
    prazo_dias   integer       NOT NULL,
    ativa        boolean       NOT NULL DEFAULT true,
    criado_em    timestamptz   NOT NULL DEFAULT now(),
    alterado_em  timestamptz,
    CONSTRAINT pk_faixa_frete PRIMARY KEY (id),
    CONSTRAINT ck_faixa_frete_faixa CHECK (cep_inicio ~ '^[0-9]{8}$' AND cep_fim ~ '^[0-9]{8}$' AND cep_inicio <= cep_fim),
    CONSTRAINT ck_faixa_frete_valores CHECK (valor >= 0 AND prazo_dias > 0)
);
CREATE INDEX ix_faixa_frete_cep ON faixa_frete (cep_inicio, cep_fim) WHERE ativa;

CREATE TABLE configuracao (
    chave         varchar(100) NOT NULL,
    valor         varchar(500) NOT NULL,
    alterado_em   timestamptz,
    alterado_por  varchar(100),
    CONSTRAINT pk_configuracao PRIMARY KEY (chave)
);

INSERT INTO configuracao (chave, valor) VALUES
    ('frete.cep_origem',          '13270000'),  -- ajustar para o CEP de onde os pedidos são postados
    ('frete.dias_manuseio',       '1'),
    ('frete.gratis_a_partir_de',  '0'),         -- 0 = sem frete grátis
    ('pagamento.parcelas_maximas','12'),
    ('pagamento.parcela_minima',  '10.00');
