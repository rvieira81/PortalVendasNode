# ADR-008: Docker, GitHub Actions e GHCR

**Contexto:** ambiente idêntico do desenvolvimento à produção e entrega contínua.
**Decisão:** Dockerfile multi-stage para a API (Node 22 alpine, usuário `node`) e para o front (build Vite → nginx alpine). `docker compose` sobe tudo localmente. GitHub Actions: CI em todo push/PR (lint, typecheck, testes com PostgreSQL de serviço, build, `npm audit`); CD na branch `main`/tags publica as imagens no GHCR e implanta em homologação e, com aprovação manual, em produção via SSH + `docker compose pull && up -d`.
**Consequências:** o servidor só precisa de Docker; rollback = voltar a tag da imagem. Migrações rodam antes de subir a nova API, com backup prévio.
