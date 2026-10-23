# ADR-004: Sessão em cookie assinado, CSRF double submit e TOTP no admin

**Contexto:** SPA e API na mesma origem; precisa invalidar sessões ao trocar senha; admin exige 2FA.
**Opções:** JWT em `localStorage` (exposto a XSS); sessão em servidor (Redis); cookie HttpOnly assinado com verificação do carimbo de segurança.
**Decisão:** cookie `pv_sessao` HttpOnly/SameSite=Lax assinado com HMAC; a API confere `carimbo_seguranca` no banco a cada requisição; CSRF por cookie `pv_csrf` + cabeçalho `X-CSRF-Token`. TOTP próprio (RFC 6238) com segredo cifrado em AES-256-GCM.
**Consequências:** sem Redis; uma leitura por PK por requisição autenticada; revogação imediata. Escalar horizontalmente não exige sessão compartilhada.
