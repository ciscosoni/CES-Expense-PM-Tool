# syntax=docker/dockerfile:1.6

# CES Tech internal tool — production image for @ces/api.
# Multi-stage build optimised for Turborepo + pnpm workspaces.
#
# Build from the REPO ROOT so the build context sees pnpm-workspace.yaml + all
# packages/*:
#   docker build -f apps/api/Dockerfile -t ces-api:local .

ARG NODE_VERSION=22.11.0
ARG PNPM_VERSION=9.12.0
ARG ALPINE_VERSION=3.20

# =====================================================================
# Stage 1 — base: pnpm + corepack
# =====================================================================
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base
RUN apk add --no-cache libc6-compat openssl tini && \
    npm install -g corepack@latest && \
    corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /repo
ENV PNPM_HOME=/pnpm-store
ENV PATH=$PNPM_HOME:$PATH

# =====================================================================
# Stage 2 — deps: install ALL workspace deps (cached on lockfile)
# =====================================================================
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json ./
COPY apps/api/package.json ./apps/api/
# All workspace manifests must be present + match the lockfile, or
# --frozen-lockfile fails (ERR_PNPM_OUTDATED_LOCKFILE). --filter @ces/api...
# still installs only the api subgraph, so the other apps add no deps.
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages ./packages
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --filter @ces/api... --prod=false

# =====================================================================
# Stage 3 — builder: copy source + compile + prisma generate
# =====================================================================
FROM deps AS builder
COPY apps/api ./apps/api
RUN pnpm --filter @ces/api exec prisma generate
RUN pnpm --filter @ces/api... build

# =====================================================================
# Stage 4 — prod-deps: only production deps for runtime
# =====================================================================
FROM base AS prod-deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages ./packages
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --filter @ces/api... --prod=true
# Generate the Prisma client INTO the prod node_modules that the runtime image
# copies. The builder stage's generate doesn't carry over — runtime takes
# node_modules from here, not from builder. Needs the schema present.
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm --filter @ces/api exec prisma generate

# =====================================================================
# Stage 5 — runtime: minimal node image with the built API
# =====================================================================
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runtime
RUN apk add --no-cache tini openssl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S api -u 1001 -G nodejs
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=4000

# 1. node_modules (workspace-aware, pruned to prod): the root .pnpm store + the
#    api's own per-workspace symlinks (reflect-metadata, @nestjs/*, prisma, @ces/*).
#    pnpm keeps app deps under apps/api/node_modules, NOT the root, so both are needed.
COPY --from=prod-deps --chown=api:nodejs /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=api:nodejs /repo/apps/api/node_modules ./apps/api/node_modules
# 2. Built workspace packages — copied from BUILDER so their compiled dist/ is
#    present (@ces/* resolve to ./dist/index.js); prod-deps never builds them.
COPY --from=builder --chown=api:nodejs /repo/packages ./packages
# 3. Built api
COPY --from=builder --chown=api:nodejs /repo/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=api:nodejs /repo/apps/api/package.json ./apps/api/
COPY --from=builder --chown=api:nodejs /repo/apps/api/prisma ./apps/api/prisma
# 3. Entrypoint script (runs migrations then boots Nest)
COPY --chown=api:nodejs apps/api/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER api
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:4000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
