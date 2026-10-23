# 05 — Plano e resultado dos testes

## 1. Estratégia (pirâmide)

| Nível | Ferramenta | Onde | O que cobre |
|---|---|---|---|
| Unitário | Jest + ts-jest | `apps/api/src/**/*.spec.ts` | Regras puras: CPF, dinheiro em centavos, máquina de estados, parcelas, totais, dias úteis, senha scrypt, cookie assinado, AES-GCM, assinatura do webhook, TOTP (vetor da RFC 6238), tipo real das imagens |
| Integração | Jest + supertest + **PostgreSQL real** | `apps/api/test/*.e2e-spec.ts` | API inteira (NestJS + banco migrado do zero a cada execução). Mercado Pago, Melhor Envio, ViaCEP, SMTP e relógio substituídos por falsos controláveis |
| Componentes | Vitest + Testing Library | `apps/web/src/**/*.test.ts(x)` | Formatação, componentes de UI, formulário de endereço com ViaCEP, cliente HTTP com CSRF |
| Manual / E2E | Navegador + credenciais de teste | Roteiro da seção 5 | Pagamento real no sandbox do Mercado Pago e frete no sandbox do Melhor Envio |

O banco de teste é recriado e migrado pelo `globalSetup` a cada execução (valida os scripts SQL — Portão 3). O nome precisa conter "teste" (proteção contra apagar outro banco).

## 2. Como rodar

```bash
# PostgreSQL local (docker compose up db) ou o do CI
export DATABASE_URL_TESTE=postgres://portal:portal@localhost:5433/portalvendas_teste   # PowerShell: $env:DATABASE_URL_TESTE="..."
npm test                      # API (unitários + integração) e front
npm test -w apps/api -- --coverage
npm run test:unit -w apps/api # só unitários, sem banco
```

## 3. Resultado da última execução

| Suíte | Casos | Resultado |
|---|---|---|
| API — unitários | 68 | ✅ 68/68 |
| API — integração (PostgreSQL 16) | 74 | ✅ 74/74 |
| Front — Vitest | 14 | ✅ 14/14 |
| **Total** | **156** | **✅ 156/156** |

Cobertura da API (unitários + integração): **~91% das linhas**, 95% em `dominio/`, acima de 88% em todos os serviços de negócio (RNF13 ≥ 80%).

## 4. Matriz de rastreabilidade

| Requisito | Casos de teste (arquivo › descrição) | Status |
|---|---|---|
| RF01 Listar | catalogo › lista só ativos… · pagina de 12 em 12 | ✅ |
| RF02 Buscar/filtrar | catalogo › busca sem diferenciar acentos · filtra por categoria e preço e ordena | ✅ |
| RF03 Detalhe | catalogo › mostra o detalhe com parcelas e 404… | ✅ |
| RF04 Carrinho | carrinho › 7 casos (adicionar/alterar/remover, limite de estoque, 10 por produto, esgotado, preço alterado, mescla no login, isolamento) | ✅ |
| RF05 Cadastro/login | auth › cadastra… · CPF inválido · não revela e-mail existente · bloqueio após 5 falhas · mesma mensagem · confirma e-mail uso único | ✅ |
| RF06 Recuperar senha | auth › redefine e derruba sessões · link expira em 1 hora | ✅ |
| RF07 Endereços | pedidos › consulta CEP… · valida UF e CEP · IDOR de endereço; web › EnderecoForm (3) | ✅ |
| RF08 Frete | pedidos › cota e soma manuseio · contingência · "Não entregamos" · frete grátis | ✅ |
| RF09 Finalizar | pedidos › valores do servidor + reserva · exige e-mail confirmado · idempotência (duplo clique simultâneo) · última unidade (concorrência) · frete alterado · endereço de outro cliente · preço congelado | ✅ |
| RF10 Pix | pagamentos › gera Pix 30 min · reaproveita Pix válido · job expira Pix | ✅ |
| RF11 Cartão | pagamentos › aprovado com parcelas · parcela mínima · recusado com motivo e nova tentativa · em análise | ✅ |
| RF12 Boleto | pagamentos › boleto vence em 3 dias úteis | ✅ |
| RF13 Webhook | pagamentos › webhook assinado confirma · assinatura inválida 401 · não confia no corpo · notificação duplicada; unit › assinatura (4) | ✅ |
| RF14 Meus pedidos | pedidos › só os próprios; outro cliente 404 | ✅ |
| RF15 E-mails | auth/pedidos/pagamentos › e-mails de confirmação, pedido recebido, pagamento aprovado | ✅ |
| RF16 Cancelar | pedidos › devolve reserva; pagamentos › cancela pago com estorno; admin › cancelamento em separação | ✅ |
| RF17 Produtos | admin › cadastra · SKU repetido/medidas/preço "de" · estoque abaixo do reservado · imagens reais ≤ 2 MB · vendido só desativa | ✅ |
| RF18 Pedidos (admin) | admin › fluxo de status com autor · filtros | ✅ |
| RF19 Configurar frete | admin › configurações e faixas | ✅ |
| RF20 Painel | admin › painel de vendas | ✅ |
| RN03 Estoque nunca negativo | pedidos › não vende a última unidade duas vezes | ✅ |
| RN04 Prazos | pagamentos › job expira Pix · consulta antes de expirar | ✅ |
| RN07 Transições | unit › 17 transições; admin › 409 em transição inválida | ✅ |
| RN08 Pago só com API | pagamentos › não confia no corpo · valor divergente é estornado | ✅ |
| RNF02/RNF05 Segurança | auth › CSRF · 2FA obrigatório · TOTP sem reuso · cliente 403 no painel | ✅ |
| RNF07 LGPD | admin › mascara CPF/telefone · exporta dados · anonimiza mantendo pedidos | ✅ |

## 5. Roteiro manual em homologação (credenciais de TESTE)

1. Criar conta com CPF válido; confirmar o e-mail pelo link.
2. Adicionar 2 produtos, calcular frete para um CEP de SP e para um CEP do Norte.
3. **Pix:** gerar QR Code; no painel do Mercado Pago de teste, aprovar; a tela deve virar "Pagamento aprovado" sozinha em até 10 s.
4. **Cartão aprovado:** cartão de teste Mastercard `5031 4332 1540 6351`, CVV `123`, validade `11/30`, titular **APRO**, CPF `12345678909`.
5. **Cartão recusado:** mesmo cartão com titular **OTHE** (recusa genérica) e **FUND** (saldo insuficiente) — a mensagem deve explicar o motivo.
6. **Boleto:** gerar e conferir linha digitável e PDF.
7. Cancelar um pedido pago e conferir o estorno no painel do Mercado Pago.
8. Admin: entrar, configurar o autenticador, mudar status até "Entregue" com código de rastreio; conferir os e-mails.
9. Repetir o fluxo de compra no celular (Chrome Android e Safari iOS).

Critério de saída: zero bugs críticos/altos; todos os itens acima executados.

## 6. Segurança testada

| Ataque | Defesa | Teste |
|---|---|---|
| CSRF | cookie + cabeçalho | auth › exige o token CSRF |
| IDOR | filtro pelo dono → 404 | pedidos › outro cliente 404 · endereço de outro cliente |
| Força bruta | bloqueio 15 min + rate limit | auth › bloqueia após 5 senhas |
| Sessão roubada após troca de senha | carimbo de segurança | auth › redefine e derruba sessões |
| Upload malicioso | assinatura de bytes + 2 MB + nome gerado | admin › aceita só imagens reais |
| Webhook forjado | HMAC + consulta à API | pagamentos › assinatura inválida · não confia no corpo |
| Manipulação de preço/frete | recálculo no servidor | pedidos › valores do servidor · frete alterado |
| Injeção SQL na busca | parâmetros + escape de `%`/`_` | catalogo › busca com `100%` |

## 7. Bugs encontrados e corrigidos durante os testes

| # | Severidade | Descrição | Correção |
|---|---|---|---|
| 1 | Alta | Duplo clique simultâneo em "Ir para o pagamento" podia devolver erro "carrinho vazio" no segundo clique em vez do pedido criado | `PedidosService.criar` volta a procurar o pedido pela chave de idempotência em qualquer falha |
| 2 | Média | Botão "Adicionar ao carrinho" levava ao carrinho (devia ficar na página) | Corrigido no `Produto.tsx`, mostra confirmação |
| 3 | Baixa | Campos sem `type` não recebiam o estilo no painel; topo sem margem lateral no celular | CSS |
