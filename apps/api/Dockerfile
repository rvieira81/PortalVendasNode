# syntax=docker/dockerfile:1
# API NestJS — build multi-stage. Contexto: raiz do repositório.
#   docker build -f apps/api/Dockerfile -t portalvendas-api .

FROM node:26-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/api --include-workspace-root --no-audit --no-fund

FROM dependencias AS build
COPY apps/api apps/api
RUN npm run build -w apps/api

FROM node:26-alpine AS producao-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/api --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:26-alpine
ENV NODE_ENV=production \
    PORTA=3000 \
    MIGRACOES_DIR=/app/db \
    IMAGENS_DIR=/dados/imagens
WORKDIR /app
COPY --from=producao-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/package.json ./apps/api/
COPY db ./db
RUN mkdir -p /dados/imagens && chown -R node:node /dados
USER node
EXPOSE 3000
VOLUME ["/dados"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Outros comandos na mesma imagem:
#   migrações:  node apps/api/dist/db/migrar.cli.js [--seed]
#   admin:      node apps/api/dist/admin/criar-admin.cli.js email "Nome"
CMD ["node", "apps/api/dist/main.js"]
