# syntax=docker/dockerfile:1.6

# CES Tech internal tool — production image for @ces/web (Next.js 15).
# Uses Next.js standalone output so the runtime image is ~150MB.
#
# Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile -t ces-web:local .

ARG NODE_VERSION=22.11.0
ARG PNPM_VERSION=9.12.0
ARG ALPINE_VERSION=3.20

# =====================================================================
# Stage 1 — base
# =====================================================================
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base
RUN apk add --no-cache libc6-compat tini && \
    corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /repo
ENV PNPM_HOME=/pnpm-store
ENV PATH=$PNPM_HOME:$PATH

# =====================================================================
# Stage 2 — deps
# =====================================================================
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages ./packages
RUN mkdir -p apps/api apps/mobile && \
    echo '{"name":"@ces/api","private":true,"version":"0.0.0"}' > apps/api/package.json && \
    echo '{"name":"@ces/mobile","private":true,"version":"0.0.0"}' > apps/mobile/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --filter @ces/web... --prod=false

# =====================================================================
# Stage 3 — builder
# =====================================================================
FROM deps AS builder
COPY apps/web ./apps/web
# Next.js needs these public-facing env vars at BUILD time (they're baked
# into the client bundle). Pass them via --build-arg in CI.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ARG NEXT_PUBLIC_AZURE_TENANT_ID=00000000-0000-0000-0000-000000000000
ARG NEXT_PUBLIC_AZURE_WEB_CLIENT_ID=00000000-0000-0000-0000-000000000000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_AZURE_TENANT_ID=$NEXT_PUBLIC_AZURE_TENANT_ID
ENV NEXT_PUBLIC_AZURE_WEB_CLIENT_ID=$NEXT_PUBLIC_AZURE_WEB_CLIENT_ID
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @ces/web... build

# =====================================================================
# Stage 4 — runtime: standalone server
# =====================================================================
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runtime
RUN apk add --no-cache tini && \
    addgroup -g 1001 -S nodejs && \
    adduser -S web -u 1001 -G nodejs
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Next.js standalone output layout:
#   .next/standalone/  — self-contained node server (server.js + minimal node_modules)
#   .next/static/      — must be co-located at .next/static next to the server
#   public/            — public assets
COPY --from=builder --chown=web:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=web:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=web:nodejs /repo/apps/web/public ./apps/web/public

USER web
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/login || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
