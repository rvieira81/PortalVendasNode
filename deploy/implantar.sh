#!/usr/bin/env sh
# Implanta uma versão no servidor (chamado pelo pipeline via SSH ou à mão).
#   ./deploy/implantar.sh v1.2.0
# Passos: backup do banco → baixa as imagens → migrações → sobe → confere /api/health.
# Se o health check falhar, volta a versão anterior (o banco é restaurado só à mão — ver docs/06).
set -eu
cd "$(dirname "$0")/.."

NOVA="${1:?Informe a versão (tag da imagem), ex.: v1.2.0}"
COMPOSE="docker compose -f docker-compose.prod.yml"
ANTERIOR="$(cat .versao-atual 2>/dev/null || echo '')"
set -a; . ./.env; set +a

echo ">> Backup antes do deploy"
mkdir -p backups
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "backups/pre-deploy-$(date +%Y%m%d-%H%M)-$NOVA.dump"

echo ">> Baixando imagens $NOVA"
VERSAO="$NOVA" $COMPOSE pull api web migrar

echo ">> Migrações"
VERSAO="$NOVA" $COMPOSE --profile migracao run --rm migrar

echo ">> Subindo $NOVA"
VERSAO="$NOVA" $COMPOSE up -d api web proxy backup

echo ">> Conferindo /api/health"
for i in $(seq 1 30); do
  if $COMPOSE exec -T api node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "$NOVA" > .versao-atual
    echo ">> Versão $NOVA no ar."
    exit 0
  fi
  sleep 2
done

echo "!! Health check falhou."
if [ -n "$ANTERIOR" ]; then
  echo ">> Voltando para $ANTERIOR"
  VERSAO="$ANTERIOR" $COMPOSE up -d api web
fi
exit 1
