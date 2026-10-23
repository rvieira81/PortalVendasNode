# ADR-007: Job de manutenção dentro da API com advisory lock

**Contexto:** expirar Pix/boleto, conciliar pagamentos sem webhook e limpar dados vencidos a cada 5 min.
**Opções:** cron no host; contêiner separado de worker; timer dentro da API.
**Decisão:** timer dentro da API, protegido por `pg_try_advisory_lock(727001)`: com várias réplicas, só uma executa cada rodada. Desligável por `MANUTENCAO_ATIVA=false`.
**Consequências:** nada extra para implantar; se a carga crescer, o mesmo serviço pode rodar num contêiner worker com a API desligada (`MODO=worker`, backlog).
