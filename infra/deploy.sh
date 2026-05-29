#!/usr/bin/env bash
# =====================================================================
# CES Tech — Azure first-deploy bootstrap (Batch 3)
#
# Idempotent: rerunning against the same RG just rolls newer image tags
# through Container Apps + reapplies any infra drift. Safe to re-run.
#
# Prereqs (one-time, on your laptop):
#   1. brew install azure-cli      (or https://aka.ms/installazurecliwindows)
#   2. az login                    (opens a browser, signs in to your CES tenant)
#   3. az account set --subscription "<your subscription name or ID>"
#
# Then from the repo root:
#   bash infra/deploy.sh
#
# What you'll be asked for, in order:
#   - Resource group name (default: ces-prod-rg)
#   - Azure region        (default: centralindia)
#   - Postgres password   (generated if you leave blank — copy it somewhere safe)
#   - Anthropic API key   (optional — paste or leave blank; only stored in KV)
#
# Output: prints the live URLs at the end + a smoke-test command.
# =====================================================================
set -euo pipefail

# Resolve to the directory containing this script so it can be run from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BICEP_FILE="${SCRIPT_DIR}/main.bicep"

# --- prerequisites ----------------------------------------------------
if ! command -v az >/dev/null 2>&1; then
  echo "❌ az CLI not found. Install: brew install azure-cli" >&2
  exit 1
fi

CURRENT_ACCOUNT=$(az account show --query '{ name: name, id: id, tenant: tenantId }' -o json 2>/dev/null || true)
if [[ -z "${CURRENT_ACCOUNT}" || "${CURRENT_ACCOUNT}" == "null" ]]; then
  echo "❌ Not signed in. Run: az login" >&2
  exit 1
fi
echo "▸ Using subscription:"
echo "${CURRENT_ACCOUNT}" | sed 's/^/  /'
echo

# --- prompts ----------------------------------------------------------
read -r -p "Resource group name [ces-prod-rg]: " RG
RG=${RG:-ces-prod-rg}

read -r -p "Region [centralindia]: " LOC
LOC=${LOC:-centralindia}

read -r -p "Environment slug [prod]: " ENV_SLUG
ENV_SLUG=${ENV_SLUG:-prod}

read -r -p "GHCR owner [ciscosoni]: " GHCR_OWNER
GHCR_OWNER=${GHCR_OWNER:-ciscosoni}

read -r -p "API image tag from GHCR [latest]: " API_TAG
API_TAG=${API_TAG:-latest}

read -r -p "Web image tag from GHCR [latest]: " WEB_TAG
WEB_TAG=${WEB_TAG:-latest}

# Postgres password — generate if blank. We do NOT echo the typed password.
read -r -s -p "Postgres admin password (enter to auto-generate, recommended): " PG_PASS || true
echo
if [[ -z "${PG_PASS}" ]]; then
  PG_PASS=$(LC_ALL=C tr -dc 'A-Za-z0-9!@#%^*_+-' </dev/urandom | head -c 28)
  echo "▸ Generated PG password (COPY THIS NOW — it's not stored anywhere else):"
  echo "  ${PG_PASS}"
  echo
fi

# Anthropic key — optional.
read -r -s -p "Anthropic API key (blank to skip): " ANTHROPIC_KEY || true
echo

# --- resource group ---------------------------------------------------
echo
echo "▸ Ensuring resource group ${RG} in ${LOC}…"
az group create --name "${RG}" --location "${LOC}" --output none

# --- deployment -------------------------------------------------------
DEPLOY_NAME="ces-batch3-$(date +%Y%m%d-%H%M%S)"
echo "▸ Submitting deployment ${DEPLOY_NAME} — first run takes ~6-10 minutes (Postgres provisioning is the slow step)…"

PARAMETERS=(
  "env=${ENV_SLUG}"
  "location=${LOC}"
  "ghcrOwner=${GHCR_OWNER}"
  "apiImageTag=${API_TAG}"
  "webImageTag=${WEB_TAG}"
  "pgAdminPassword=${PG_PASS}"
  "anthropicApiKey=${ANTHROPIC_KEY}"
)

az deployment group create \
  --resource-group "${RG}" \
  --name "${DEPLOY_NAME}" \
  --template-file "${BICEP_FILE}" \
  --parameters "${PARAMETERS[@]}" \
  --output none

# --- outputs ----------------------------------------------------------
echo
echo "▸ Deployment complete. Reading outputs…"

API_URL=$(az deployment group show --resource-group "${RG}" --name "${DEPLOY_NAME}" --query 'properties.outputs.apiUrl.value' -o tsv)
WEB_URL=$(az deployment group show --resource-group "${RG}" --name "${DEPLOY_NAME}" --query 'properties.outputs.webUrl.value' -o tsv)
KV_NAME=$(az deployment group show --resource-group "${RG}" --name "${DEPLOY_NAME}" --query 'properties.outputs.keyVaultName.value' -o tsv)
PG_FQDN=$(az deployment group show --resource-group "${RG}" --name "${DEPLOY_NAME}" --query 'properties.outputs.postgresFqdn.value' -o tsv)

cat <<EOF

==========================================================
 CES Tech is live on Azure — Central India
==========================================================

  Web:        ${WEB_URL}
  API:        ${API_URL}
  API docs:   ${API_URL}/docs
  Key Vault:  ${KV_NAME}
  Postgres:   ${PG_FQDN}

SMOKE TESTS — copy/paste these to verify the deployment:

  # 1. Liveness (no DB)
  curl -fsS "${API_URL}/api/health"

  # 2. Readiness (DB ping; 503 if PG is down)
  curl -fsS "${API_URL}/api/ready"

  # 3. Auth gate (dev-header path) — should return some users JSON
  curl -fsS -H "X-Dev-User-Email: admin@cestech.in" "${API_URL}/api/users"

  # 4. Web — paste in a browser, sign in as admin@cestech.in
  open "${WEB_URL}"

NEXT STEPS:
  - Reseed sample data once (one-shot job): see DEPLOYMENT.md Batch 3 \"Seeding production\".
  - Move to Batch 4 to wire real Entra ID auth + Azure Blob receipts.

EOF
