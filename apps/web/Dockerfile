# syntax=docker/dockerfile:1
# Front React servido pelo nginx, que também repassa /api para a API.
#   docker build -f apps/web/Dockerfile -t portalvendas-web .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root --no-audit --no-fund
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM nginx:1.31-alpine
ENV API_UPSTREAM=api:3000
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/saude-nginx || exit 1
