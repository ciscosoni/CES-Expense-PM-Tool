#!/bin/sh
# Production entrypoint — apply pending migrations against the configured DB,
# then hand off to the container's CMD (node apps/api/dist/main.js).
#
# Migrations are idempotent (`prisma migrate deploy`) and safe to run on every
# boot. Skipping it (RUN_MIGRATIONS=false) is supported for sidecar setups
# where a separate job owns migrations.

set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] Running prisma migrate deploy…"
  cd /app/apps/api
  # pnpm keeps the prisma CLI under the app's own node_modules (a symlink into
  # the root .pnpm store), NOT a hoisted root node_modules.
  node node_modules/prisma/build/index.js migrate deploy
  cd /app
  echo "[entrypoint] Migrations applied."
else
  echo "[entrypoint] RUN_MIGRATIONS=false — skipping migrations."
fi

exec "$@"
