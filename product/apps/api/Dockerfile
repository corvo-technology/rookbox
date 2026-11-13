# Build from the product/ directory:
#   docker build -f apps/api/Dockerfile -t rookbox-api .
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Build: full install, generate the Prisma client, bundle the server.
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter @rookbox/api...
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @rookbox/api generate && pnpm --filter @rookbox/api build

# Production dependencies only.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --prod --filter @rookbox/api...

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma/migrations ./prisma/migrations
COPY apps/api/package.json ./
USER node
EXPOSE 3000
# The server applies pending migrations (RUN_MIGRATIONS, default true) and then listens.
CMD ["node", "--enable-source-maps", "dist/index.js"]
