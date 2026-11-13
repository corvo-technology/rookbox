# Landing site: static Astro build served by Caddy.
# Build from the product/ directory:
#   docker build -f apps/www/Dockerfile \
#     --build-arg PUBLIC_SITE_URL=https://rookbox.run \
#     --build-arg PUBLIC_DASHBOARD_URL=https://app.rookbox.run/ \
#     --build-arg PUBLIC_SDK_DOMAIN=box.rookbox.run \
#     -t rookbox-www .
FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/www/package.json apps/www/
COPY packages/ui-tokens/package.json packages/ui-tokens/
COPY packages/ui-web/package.json packages/ui-web/
RUN pnpm install --frozen-lockfile --filter @rookbox/www...
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/www apps/www
ARG PUBLIC_SITE_URL=https://box.example.com
ARG PUBLIC_DASHBOARD_URL
ARG PUBLIC_SDK_DOMAIN
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL PUBLIC_DASHBOARD_URL=$PUBLIC_DASHBOARD_URL PUBLIC_SDK_DOMAIN=$PUBLIC_SDK_DOMAIN
# robots.txt names the sitemap by absolute URL.
RUN sed -i "s|https://box.example.com|${PUBLIC_SITE_URL}|" apps/www/public/robots.txt
RUN pnpm --filter @rookbox/www build

FROM caddy:2.10-alpine
COPY apps/www/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/www/dist /srv
EXPOSE 80
