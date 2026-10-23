# Portal de Vendas (TypeScript)

## Fase atual: 6 — Implantação (aguardando repositório no GitHub, servidor e credenciais)

## Escopo do MVP
Loja virtual de um vendedor — mesmo escopo aprovado do Portal de Vendas em C#: vitrine, busca, carrinho, cadastro com CPF, endereço por CEP, frete em tempo real por peso e medidas (Melhor Envio), pagamento por Pix, cartão e boleto (Mercado Pago) e painel administrativo com 2FA.

## Stack decidida
- React 19 + TypeScript + Vite 7 + React Router 7 + TanStack Query 5
- Node.js 22 + NestJS 11 + Drizzle ORM + PostgreSQL 16
- Docker (multi-stage) + docker compose + nginx
- GitHub Actions (CI e CD) + GitHub Container Registry
- Jest + supertest (API, PostgreSQL real) e Vitest + Testing Library (front)

## Decisões tomadas (ADRs em docs/adr)
- 001 Monólito modular: SPA React + API NestJS no mesmo repositório e na mesma origem
- 002 NestJS + PostgreSQL
- 003 Drizzle ORM com esquema por scripts SQL versionados
- 004 Sessão em cookie assinado + CSRF double submit + TOTP no admin
- 005 Cartão tokenizado no navegador (PCI SAQ A)
- 006 Melhor Envio com contingência por faixa de CEP
- 007 Job de manutenção dentro da API com advisory lock
- 008 Docker + GitHub Actions + GHCR

## Entregáveis
| Fase | Entregável | Situação |
|---|---|---|
| 1 Requisitos | docs/01-requisitos.md | Aprovado (reaproveitado do projeto C#) |
| 2 Arquitetura | docs/02-arquitetura.md + 8 ADRs | Pronto |
| 3 Banco | docs/03-banco.md, db/migrations/V001, db/seed/S001 | Pronto, script validado no PostgreSQL 16 |
| 4 Desenvolvimento | apps/api (NestJS), apps/web (React) — todos os RF Must e Should | Pronto, compila sem erros/avisos de lint |
| 5 Testes | 68 unitários + 74 integração (PostgreSQL real) + 14 front = 156, cobertura ~91% | ✅ 156/156 |
| 6 Implantação | Dockerfiles, docker-compose (dev e prod), nginx, Caddy, implantar.sh, CI/CD, docs/06 | Pronto; imagem da API validada fora do Docker (Docker Hub bloqueado no ambiente de build) |
| 7 Entrega | README.md, docs/07-manual.md, Swagger em /api/docs | Pronto |

## Pendências / riscos abertos
- Credenciais de teste do Mercado Pago e token do sandbox do Melhor Envio.
- Textos legais (termos e privacidade) são modelos: revisão jurídica antes do go-live.
- Nota fiscal fora do MVP.
- Servidor/nuvem de produção, domínio e SMTP a definir.

## Backlog pós-MVP
1. Emissão de NF-e (eNotas, Focus NFe, NFE.io)
2. Etiqueta do Melhor Envio pelo painel (RF22) e rastreio automático
3. Cupons de desconto (RF21) — o pedido já tem a coluna `desconto`
4. Variações de produto (tamanho/cor)
5. Imagens em armazenamento de objetos (S3/Azure Blob) + CDN
6. Renderização no servidor da vitrine (SEO) se virar requisito
7. Testes E2E automatizados com Playwright no pipeline
8. Worker separado para o job de manutenção quando houver várias réplicas sob carga

## Próximo passo
Prado: `npm ci`, `docker compose up -d db`, `npm run db:seed`, `npm test` e `npm run dev:*` em C:\SRC\PortalVendasNode. Depois: criar o repositório no GitHub, configurar os environments e os segredos (docs/06, seção 3) e rodar o roteiro manual em homologação.
