# ADR-003: Drizzle ORM com esquema por scripts SQL versionados

**Contexto:** o DBA quer controlar o DDL (constraints, índices parciais, CHECKs); a aplicação quer consultas tipadas.
**Opções:** Prisma (migrate próprio, motor binário); TypeORM (decorators, `synchronize`); Drizzle (SQL tipado, sem motor binário); SQL puro.
**Decisão:** scripts `db/migrations/Vnnn__*.sql` aplicados por `npm run db:migrar` (registra em `schema_versao`, cada script em transação) e Drizzle só para mapear tabelas e montar consultas.
**Consequências:** o banco é a fonte da verdade e o `schema.ts` precisa acompanhar cada script (o teste de integração roda sobre o banco migrado e quebra se divergir). Sem binários para baixar no build.
