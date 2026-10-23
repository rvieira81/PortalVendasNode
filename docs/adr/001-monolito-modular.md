# ADR-001: Monólito modular (SPA React + API NestJS)

**Contexto:** loja de um vendedor, ~2 mil pedidos/mês, time pequeno, exigência de React, Node, Docker e CI/CD.
**Opções:** (a) microsserviços (catálogo, pedidos, pagamentos); (b) monólito modular com front separado; (c) framework full-stack com renderização no servidor (Next.js).
**Decisão:** (b). Um repositório com `apps/web` (React) e `apps/api` (NestJS), servidos na mesma origem por nginx.
**Consequências:** um deploy, uma base de dados, transações locais para reserva de estoque e pagamento. SEO da vitrine depende de renderização no navegador (Google indexa SPA; se virar requisito forte, migrar a vitrine para SSR).
