# ADR-002: NestJS + PostgreSQL

**Contexto:** a API precisa de módulos bem separados, injeção de dependência (para trocar integrações nos testes) e banco relacional com transações.
**Opções:** Express puro; Fastify; NestJS. PostgreSQL; MySQL; SQL Server.
**Decisão:** NestJS 11 (plataforma Express) e PostgreSQL 16.
**Consequências:** estrutura padrão conhecida pelo mercado, DI nativa, guards/pipes/filters para segurança transversal. PostgreSQL é gratuito, roda leve em contêiner e tem `unaccent` + `pg_trgm` para a busca sem acento.
