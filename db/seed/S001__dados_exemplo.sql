/* =====================================================================
   PortalVendasNode — dados de exemplo para DESENVOLVIMENTO e HOMOLOGAÇÃO
   NÃO executar em produção (o migrador só roda seeds com --seed)
   As ilustrações ficam em db/seed/imagens e são copiadas para IMAGENS_DIR pelo migrador.
   O administrador é criado pela aplicação:
       npm run criar-admin -w apps/api -- admin@sualoja.com.br "Nome do Admin"
   ===================================================================== */

INSERT INTO categoria (nome, slug)
SELECT * FROM (VALUES
    ('Eletrônicos',     'eletronicos'),
    ('Casa e Cozinha',  'casa-e-cozinha'),
    ('Esporte e Lazer', 'esporte-e-lazer'),
    ('Papelaria',       'papelaria')) AS v (nome, slug)
WHERE NOT EXISTS (SELECT 1 FROM categoria);

INSERT INTO produto (categoria_id, sku, nome, slug, descricao, preco, preco_de, estoque,
                     peso_kg, altura_cm, largura_cm, comprimento_cm, criado_por)
SELECT c.id, v.sku, v.nome, v.slug, v.descricao, v.preco, v.preco_de, v.estoque,
       v.peso, v.altura, v.largura, v.comprimento, 'seed'
  FROM (VALUES
    ('eletronicos', 'ELE-0001', 'Fone de Ouvido Bluetooth', 'fone-de-ouvido-bluetooth',
        'Fone sem fio com cancelamento de ruído e 30 horas de bateria.', 199.90, 249.90, 25, 0.350, 8, 18, 20),
    ('eletronicos', 'ELE-0002', 'Carregador Turbo USB-C 30W', 'carregador-turbo-usb-c-30w',
        'Carregador rápido compatível com a maioria dos celulares.', 89.90, NULL, 60, 0.150, 5, 8, 12),
    ('eletronicos', 'ELE-0003', 'Caixa de Som Portátil', 'caixa-de-som-portatil',
        'Resistente à água, 12 horas de bateria.', 279.00, 329.00, 12, 0.800, 10, 10, 22),
    ('eletronicos', 'ELE-0004', 'Mouse sem Fio Ergonômico', 'mouse-sem-fio-ergonomico',
        'Sensor de alta precisão e pilha com duração de 12 meses.', 119.90, NULL, 0, 0.200, 6, 9, 14),
    ('casa-e-cozinha', 'CAS-0001', 'Cafeteira Elétrica 30 Xícaras', 'cafeteira-eletrica-30-xicaras',
        'Jarra de vidro, função corta-pingos e placa aquecedora.', 159.90, NULL, 15, 2.100, 32, 22, 28),
    ('casa-e-cozinha', 'CAS-0002', 'Jogo de Panelas Antiaderente 5 Peças', 'jogo-de-panelas-antiaderente-5-pecas',
        'Revestimento antiaderente e cabos com toque frio.', 349.90, 429.90, 8, 5.400, 25, 35, 45),
    ('casa-e-cozinha', 'CAS-0003', 'Garrafa Térmica 1 Litro', 'garrafa-termica-1-litro',
        'Mantém a bebida quente por 12 horas.', 79.90, NULL, 40, 0.600, 30, 10, 10),
    ('esporte-e-lazer', 'ESP-0001', 'Tapete de Yoga 6 mm', 'tapete-de-yoga-6mm',
        'Antiderrapante, com alça para transporte.', 99.90, NULL, 30, 1.100, 12, 12, 62),
    ('esporte-e-lazer', 'ESP-0002', 'Garrafa Squeeze 750 ml', 'garrafa-squeeze-750ml',
        'Livre de BPA, com bico retrátil.', 39.90, NULL, 100, 0.150, 24, 8, 8),
    ('esporte-e-lazer', 'ESP-0003', 'Kit Elásticos de Resistência', 'kit-elasticos-de-resistencia',
        'Cinco níveis de resistência, com bolsa.', 69.90, 89.90, 3, 0.400, 5, 15, 20),
    ('papelaria', 'PAP-0001', 'Caderno Universitário 10 Matérias', 'caderno-universitario-10-materias',
        '200 folhas, capa dura.', 34.90, NULL, 80, 0.900, 3, 21, 28),
    ('papelaria', 'PAP-0002', 'Caneta Gel Kit com 12 Cores', 'caneta-gel-kit-12-cores',
        'Ponta 0,7 mm, tinta de secagem rápida.', 29.90, NULL, 120, 0.120, 2, 10, 16)
  ) AS v (categoria, sku, nome, slug, descricao, preco, preco_de, estoque, peso, altura, largura, comprimento)
  JOIN categoria c ON c.slug = v.categoria
 WHERE NOT EXISTS (SELECT 1 FROM produto);

INSERT INTO produto_imagem (produto_id, arquivo, ordem)
SELECT p.id, f.arquivo, 0
  FROM (VALUES
    ('ELE-0001', '32c810fcd7604646a2b394fcd1e4f804.png'),
    ('ELE-0002', 'dcc43d2951b7434494210c520282e01f.png'),
    ('ELE-0003', 'f13b883d55c5439db09f4d066f9462de.png'),
    ('ELE-0004', 'b94f9c1559c04095840d8558e8d8df42.png'),
    ('CAS-0001', '3e92eb43ebaa45ff9b37d9c683e3c720.png'),
    ('CAS-0002', 'dcd30ec23f7c455aa37653c94b79b4c9.png'),
    ('CAS-0003', 'cb5ac57ddecc4649843e341e7c2a014e.png'),
    ('ESP-0001', '85c39cff118a40588fa4016a5c68c8e7.png'),
    ('ESP-0002', 'a7995204195d4ee3b3ebcf76f19bf986.png'),
    ('ESP-0003', 'c859e74c2e36444da250f9fb3c634261.png'),
    ('PAP-0001', '777fcd42023f433aa114060ab46cc0d2.png'),
    ('PAP-0002', 'c9961c4882bc493c80bceaae349c6c75.png')
  ) AS f (sku, arquivo)
  JOIN produto p ON p.sku = f.sku
 WHERE NOT EXISTS (SELECT 1 FROM produto_imagem i WHERE i.produto_id = p.id);

-- Tabela de contingência (usada só se a API do Melhor Envio estiver fora ou sem token)
INSERT INTO faixa_frete (descricao, cep_inicio, cep_fim, valor, prazo_dias)
SELECT * FROM (VALUES
    ('Capital e Grande São Paulo', '01000000', '09999999', 19.90, 4),
    ('Interior de São Paulo',      '10000000', '19999999', 24.90, 5),
    ('RJ, ES e MG',                '20000000', '39999999', 34.90, 7),
    ('Nordeste',                   '40000000', '65999999', 49.90, 12),
    ('Norte e Centro-Oeste',       '66000000', '79999999', 54.90, 14),
    ('Sul',                        '80000000', '99999999', 39.90, 8)) AS v (descricao, cep_inicio, cep_fim, valor, prazo_dias)
WHERE NOT EXISTS (SELECT 1 FROM faixa_frete);
