# Dashboard: static build served by Caddy, with a single-page-app fallback.
# Build from the product/ directory:
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_URL=https://api.rookbox.run \
#     --build-arg VITE_E2B_DOMAIN=box.rookbox.run \
#     -t rookbox-web .
FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui-tokens/package.json packages/ui-tokens/
COPY packages/ui-web/package.json packages/ui-web/
RUN pnpm install --frozen-lockfile --filter @rookbox/web...
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/web apps/web
# Vite inlines these at build time, so they are build arguments, not runtime variables.
ARG VITE_API_URL
ARG VITE_E2B_DOMAIN
ARG VITE_DOCS_URL
ENV VITE_API_URL=$VITE_API_URL VITE_E2B_DOMAIN=$VITE_E2B_DOMAIN VITE_DOCS_URL=$VITE_DOCS_URL
RUN pnpm --filter @rookbox/web build

FROM caddy:2.10-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 80
