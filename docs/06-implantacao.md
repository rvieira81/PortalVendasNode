# 06 — Implantação (Docker + GitHub Actions)

## 1. Ambientes

| Ambiente | Onde | Como chega a nova versão | Mercado Pago | Melhor Envio |
|---|---|---|---|---|
| Desenvolvimento | Máquina do dev (`npm run dev:*` ou `docker compose up`) | — | `TEST-` | sandbox |
| Homologação | Servidor com Docker | Automático a cada push na `main` | `TEST-` | sandbox |
| Produção | Servidor com Docker (ou nuvem) | Tag `vX.Y.Z` + **aprovação manual** no GitHub | `APP_USR-` | produção |

Toda configuração vem de variáveis de ambiente (`.env` no servidor, nunca no Git). Lista completa em `.env.exemplo` (compose) e `apps/api/.env.exemplo` (dev).

## 2. Desenvolvimento local

Pré-requisitos: Node.js 22, Docker Desktop (para o PostgreSQL) e Git.

```powershell
cd C:\SRC\PortalVendasNode
npm ci
docker compose up -d db                       # só o PostgreSQL
copy apps\api\.env.exemplo apps\api\.env      # ajuste DATABASE_URL e gere SESSAO_SEGREDO / CHAVE_CIFRAGEM
npm run db:seed                               # cria as tabelas e os dados de exemplo
npm run dev:api                               # http://localhost:3000/api/docs (Swagger)
npm run dev:web                               # http://localhost:5173 (em outro terminal)
npm run criar-admin -w apps/api -- admin@sualoja.com.br "Seu Nome"
```

Com `DATABASE_URL=postgres://portal:portal@localhost:5433/portalvendas` (usuário e senha padrão do compose). Os e-mails viram arquivos em `apps/api/emails-dev`.

**Tudo em contêiner** (igual à produção, sem Node na máquina):

```powershell
copy .env.exemplo .env      # preencha SESSAO_SEGREDO e CHAVE_CIFRAGEM
docker compose up --build   # loja em http://localhost:8080
docker compose exec api node apps/api/dist/admin/criar-admin.cli.js admin@sualoja.com.br "Seu Nome"
```

## 3. Pipeline (GitHub Actions)

```mermaid
flowchart LR
    PR[Pull request / push em branch] --> CI[ci.yml<br/>lint · tipos · 156 testes · build · audit · imagens]
    M[Push na main] --> CD1[cd.yml: CI] --> P1[Imagens no GHCR<br/>tag sha-xxxxxxx] --> H[Homologação via SSH]
    T[Tag v1.2.0] --> CD2[cd.yml: CI] --> P2[Imagens no GHCR<br/>tag v1.2.0 + latest] --> A{Aprovação manual} --> PROD[Produção via SSH]
```

- **CI** (`.github/workflows/ci.yml`): PostgreSQL 16 como serviço, `npm ci`, ESLint, `tsc`, Jest (unitário + integração com cobertura), Vitest, build, `npm audit --omit=dev --audit-level=high` e build das duas imagens Docker.
- **CD** (`.github/workflows/cd.yml`): reaproveita o CI, publica `portalvendas-api` e `portalvendas-web` no GitHub Container Registry e chama `deploy/implantar.sh` no servidor por SSH.
- **Dependabot** abre PRs semanais de dependências.

### Configuração única no GitHub

1. Criar o repositório e enviar o código (`git init`, `git add .`, `git commit`, `git push`).
2. **Settings → Environments**: criar `homologacao` e `producao`. Em `producao`, marcar **Required reviewers** (aprovação manual).
3. Em cada environment, **secrets**: `SSH_CHAVE_PRIVADA` (chave só para deploy), `SSH_KNOWN_HOSTS` (saída de `ssh-keyscan servidor`), `SSH_DESTINO` (`deploy@servidor`); **variables**: `URL_HOMOLOGACAO` / `URL_PRODUCAO` e opcionalmente `PASTA_APLICACAO`.
4. **Settings → Branches**: proteger a `main` exigindo o check **CI / Lint, tipos, testes e build**.
5. Se o repositório for privado, no servidor: `docker login ghcr.io` com um token que tenha `read:packages`.

## 4. Preparar o servidor (uma vez)

Qualquer Linux com Docker 24+ (VPS, VM na Azure/AWS/GCP, servidor próprio). 2 vCPU e 4 GB de RAM atendem o volume previsto.

```bash
sudo adduser deploy && sudo usermod -aG docker deploy
sudo mkdir -p /opt/portalvendas && sudo chown deploy /opt/portalvendas
# como deploy:
cd /opt/portalvendas
# copie para cá: docker-compose.prod.yml, deploy/ (implantar.sh, Caddyfile) e crie o .env a partir do .env.exemplo
chmod 600 .env
```

- DNS do domínio apontando para o servidor; portas 80 e 443 abertas (o Caddy emite e renova o certificado HTTPS sozinho).
- Primeiro deploy à mão: `./deploy/implantar.sh v1.0.0`.
- Criar o administrador: `docker compose -f docker-compose.prod.yml exec api node apps/api/dist/admin/criar-admin.cli.js admin@sualoja.com.br "Nome"`.

### Nuvem gerenciada (alternativa sem servidor)

As mesmas imagens rodam em **Azure Container Apps**, **AWS ECS/Fargate** ou **Google Cloud Run**, com PostgreSQL gerenciado (Azure Database for PostgreSQL, RDS, Cloud SQL). Nesse caso: (1) não use os serviços `db`, `proxy` e `backup` do compose — HTTPS e backup ficam com a nuvem; (2) rode as migrações como job antes de trocar a revisão (`node apps/api/dist/db/migrar.cli.js`); (3) monte um volume persistente em `/dados` da API (ou troque o armazenamento de imagens por blob, backlog); (4) mantenha 1 réplica da API ou mais — o job de manutenção usa advisory lock.

## 5. Mercado Pago e Melhor Envio

1. Mercado Pago → **Suas integrações → Criar aplicação** (Checkout Transparente). Copie `Public Key` e `Access Token` de teste (homologação) e de produção.
2. **Webhooks → Configurar notificações**: URL `https://SEU-DOMINIO/api/webhooks/mercadopago`, evento **Pagamentos**. Copie a assinatura secreta para `MP_SEGREDO_WEBHOOK`. Use **Simular** e confira: a tabela `notificacao_gateway` recebe uma linha com `assinatura_valida = true`.
3. Melhor Envio → **Integrações → Permissões de acesso → Gerar token** com o escopo `shipping-calculate` → `ME_TOKEN`. Em produção: `ME_URL_API=https://melhorenvio.com.br`.
4. No painel da loja → **Frete e pagamento**: CEP de origem, dias de manuseio, frete grátis e parcelas.

## 6. Publicar uma nova versão

```bash
git tag v1.1.0 && git push origin v1.1.0     # dispara o CD; aprove o deploy de produção no GitHub
```

O `implantar.sh` faz, no servidor: backup `pre-deploy-*.dump` → `pull` das imagens → migrações (`migrar`) → `up -d` → espera o `/api/health`. Se o health falhar, volta sozinho para a versão anterior (`.versao-atual`).

## 7. Rollback

| O quê | Como |
|---|---|
| Aplicação | `./deploy/implantar.sh v1.0.9` (qualquer tag anterior; as imagens ficam no GHCR) |
| Banco — script reversível | aplicar `db/rollback/R00N__*.sql` |
| Banco — sem rollback | `docker compose -f docker-compose.prod.yml exec -T db pg_restore --clean --if-exists -U $POSTGRES_USER -d $POSTGRES_DB < backups/pre-deploy-....dump` (perde o que entrou depois — decidir com o negócio) |

**Ensaio obrigatório em homologação** antes do go-live: publicar, voltar para a tag anterior e restaurar um backup.

## 8. Checklist de go-live

- [ ] HTTPS válido no domínio; HTTP redireciona; HSTS ativo (Caddy)
- [ ] `.env` de produção com segredos novos (não reaproveitar os de homologação), `chmod 600`
- [ ] Mercado Pago com credenciais `APP_USR-` e webhook de produção testado com "Simular"
- [ ] Melhor Envio com token de produção e `ME_URL_API` de produção
- [ ] SMTP de produção testado (cadastro de teste recebe o e-mail)
- [ ] Administrador criado com autenticador; segundo administrador de contingência
- [ ] Banco criado só com migrações — **sem seed** (o seed nunca roda em produção)
- [ ] Backup diário funcionando, cópia fora do servidor e **um restore testado**
- [ ] Monitor externo (UptimeRobot, Better Stack…) chamando `https://SEU-DOMINIO/api/health` a cada 1 min
- [ ] Textos de Termos e Privacidade revisados pelo jurídico; dados da empresa preenchidos
- [ ] Roteiro manual de `docs/05-testes.md` executado em homologação sem bugs críticos/altos
- [ ] Ambiente `producao` no GitHub com aprovação manual

## 9. Operação

| O quê | Onde |
|---|---|
| Saúde | `GET /api/health` → 200 ou 503 |
| Logs | `docker compose -f docker-compose.prod.yml logs -f api` (JSON; cada linha com `reqId`, o mesmo mostrado ao cliente na tela de erro) |
| Webhooks | `SELECT * FROM notificacao_gateway ORDER BY id DESC LIMIT 50;` — `assinatura_valida = false` ou `erro` preenchido merecem atenção |
| Pagamentos parados | `SELECT * FROM pagamento WHERE status IN (1,2) AND criado_em < now() - interval '2 hours';` |
| Alertas sugeridos | `"level":50` no log; "assinatura inválida" repetida; "tabela de contingência" (Melhor Envio fora); `/api/health` fora |

**Administrador perdeu o celular do autenticador:** outro admin roda `criar-admin` com o mesmo e-mail (redefine senha e 2FA), ou o DBA:

```sql
UPDATE usuario SET totp_ativo = false, totp_segredo_cifrado = NULL, totp_ultimo_passo = NULL, carimbo_seguranca = gen_random_uuid()
 WHERE email = 'admin@sualoja.com.br' AND perfil = 2;
```

**Segredos:** trocar `SESSAO_SEGREDO` desloga todo mundo; trocar `CHAVE_CIFRAGEM` invalida o 2FA dos administradores (precisam reconfigurar). Guarde os dois num cofre.
