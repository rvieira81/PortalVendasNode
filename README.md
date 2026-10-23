# Portal de Vendas — React + NestJS + PostgreSQL

Loja virtual de um vendedor: vitrine, busca, carrinho, cadastro com CPF, endereço pelo CEP, frete em tempo real por peso e medidas (Melhor Envio), pagamento por **Pix, cartão e boleto** (Mercado Pago) e painel administrativo com verificação em duas etapas.

| Camada | Tecnologia |
|---|---|
| Front | React 19 + TypeScript + Vite + React Router + TanStack Query |
| API | Node.js 22 + TypeScript + NestJS 11 + Drizzle ORM |
| Banco | PostgreSQL 16 (scripts SQL versionados em `db/`) |
| Contêineres | Docker multi-stage, docker compose, nginx, Caddy (HTTPS) |
| CI/CD | GitHub Actions + GitHub Container Registry |
| Testes | Jest + supertest (API, banco real) e Vitest + Testing Library (front) — 156 casos |

## Rodar em 3 comandos (Docker)

```powershell
copy .env.exemplo .env          # preencha SESSAO_SEGREDO e CHAVE_CIFRAGEM (comandos no próprio arquivo)
docker compose up --build       # loja: http://localhost:8080 · API: http://localhost:3000/api/docs
docker compose exec api node apps/api/dist/admin/criar-admin.cli.js admin@sualoja.com.br "Seu Nome"
```

## Desenvolvimento (Node na máquina)

```powershell
npm ci
docker compose up -d db
copy apps\api\.env.exemplo apps\api\.env       # ajuste e gere os segredos
npm run db:seed
npm run dev:api        # terminal 1 — http://localhost:3000
npm run dev:web        # terminal 2 — http://localhost:5173
```

## Testes

```powershell
$env:DATABASE_URL_TESTE="postgres://portal:portal@localhost:5433/portalvendas_teste"
npm test               # lint/tipos: npm run lint · npm run typecheck
```

## Estrutura

```
apps/api     API NestJS (src/dominio = regras puras; test/ = integração)
apps/web     Front React (paginas/, admin/, componentes/)
db/          migrations/ · seed/ · rollback/
deploy/      nginx, Caddyfile, implantar.sh
docs/        requisitos, arquitetura + ADRs, banco, testes, implantação, manual
.github/     CI, CD e Dependabot
```

## Documentação

1. [Requisitos](docs/01-requisitos.md) · 2. [Arquitetura](docs/02-arquitetura.md) e [ADRs](docs/adr) · 3. [Banco](docs/03-banco.md) · 5. [Testes](docs/05-testes.md) · 6. [Implantação](docs/06-implantacao.md) · 7. [Manual](docs/07-manual.md)

API documentada em OpenAPI/Swagger: `http://localhost:3000/api/docs` (desligado em produção).
