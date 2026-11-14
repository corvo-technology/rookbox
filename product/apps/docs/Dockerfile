# Docs site: static Astro Starlight build served by Caddy. No secrets and no build arguments needed.
# Build from the product/ directory:
#   docker build -f apps/docs/Dockerfile -t rookbox-docs .
FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/docs/package.json apps/docs/
RUN pnpm install --frozen-lockfile --filter @rookbox/docs...
COPY apps/docs apps/docs
ARG PUBLIC_SITE_URL=https://docs.rookbox.run
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
RUN pnpm --filter @rookbox/docs build

FROM caddy:2.10-alpine
COPY apps/docs/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/docs/dist /srv
EXPOSE 80
