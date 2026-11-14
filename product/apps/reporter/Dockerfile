# Build from the product/ directory:
#   docker build -f apps/reporter/Dockerfile -t rookbox-reporter .
#
# The reporter bundles to one file with no runtime dependencies, so the final image is Node and
# that file. It needs Node 22.13 or later (node:sqlite without a flag).
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/reporter/package.json apps/reporter/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter @rookbox/reporter...
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/reporter apps/reporter
RUN pnpm --filter @rookbox/reporter build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    REPORTER_DB_PATH=/data/reporter.sqlite \
    HEALTH_PORT=9464
WORKDIR /app
COPY --from=build /app/apps/reporter/dist/main.js ./main.js
COPY --from=build /app/apps/reporter/dist/main.js.map ./main.js.map
# The outbox lives here: mount a volume, or undelivered events are lost with the container.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
# /healthz listens on 127.0.0.1 inside the container; run with --network host to reach it from
# the server, or use the built-in check below.
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HEALTH_PORT||9464)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "--disable-warning=ExperimentalWarning", "main.js"]
