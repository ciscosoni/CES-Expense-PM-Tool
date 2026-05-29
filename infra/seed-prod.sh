#!/usr/bin/env bash
# Run prisma seed against the deployed production Postgres — ONE-SHOT.
# Re-running is safe (the seed is idempotent) but will reset sample
# projects/expenses/etc.
#
# Usage (from the repo root, after deploy.sh has finished):
#   bash infra/seed-prod.sh ces-prod-rg
set -euo pipefail

RG="${1:-ces-prod-rg}"

if ! command -v az >/dev/null 2>&1; then
  echo "❌ az CLI not found." >&2; exit 1
fi

API_APP=$(az containerapp list --resource-group "${RG}" --query "[?contains(name, '-api')].name | [0]" -o tsv)
if [[ -z "${API_APP}" || "${API_APP}" == "null" ]]; then
  echo "❌ Could not find the api Container App in ${RG}." >&2; exit 1
fi

echo "▸ Reading DATABASE_URL from Key Vault…"
KV_NAME=$(az containerapp show --name "${API_APP}" --resource-group "${RG}" \
  --query "properties.configuration.secrets[?name=='database-url'].keyVaultUrl | [0]" -o tsv \
  | awk -F'/' '{print $3}' | awk -F'.' '{print $1}')
DATABASE_URL=$(az keyvault secret show --vault-name "${KV_NAME}" --name database-url --query value -o tsv)

echo "▸ Running prisma migrate deploy + seed locally against the managed DB…"
echo "  (This requires that your laptop's IP can reach the managed PG. The"
echo "   firewall rule 'AllowAllAzureServices' allows Azure-internal traffic;"
echo "   add your laptop IP via:  az postgres flexible-server firewall-rule create …)"

cd "$(git rev-parse --show-toplevel)/apps/api"
DATABASE_URL="${DATABASE_URL}" pnpm prisma migrate deploy
DATABASE_URL="${DATABASE_URL}" pnpm prisma db seed

echo "✓ Seed complete. Sign in as admin@cestech.in on the web URL to verify."
