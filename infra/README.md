# `infra/` — Azure infrastructure for CES Tech

Single-file Bicep deployment (`main.bicep`) provisions the entire production
stack in one resource group. See `DEPLOYMENT.md` at the repo root for the full
runbook and the batch checklist.

## Files

| File | Purpose |
|---|---|
| `main.bicep` | Sole template. Resource group → Log Analytics, Postgres, Key Vault, Storage, Container Apps Env, API + Web Container Apps. |
| `main.parameters.example.json` | Default parameter values. Copy + edit if you need a non-default deployment. |
| `deploy.sh` | One-shot interactive bootstrap. Prompts → resource group → deployment → smoke-test commands. Safe to re-run. |
| `seed-prod.sh` | One-shot: reads `DATABASE_URL` from Key Vault and runs `prisma migrate deploy && prisma db seed` against the managed Postgres. |

## Resource map

```
Resource Group  (ces-<env>-rg)
├── Log Analytics Workspace        ces-<env>-logs
├── Storage Account                cesst<env><hash>           ── receipts container
├── Postgres Flexible Server       ces-<env>-pg-<hash>        ── database "ces"
├── Key Vault                      cesvault<env><hash>        ── database-url, anthropic-api-key, storage-connection-string
├── User-Assigned Managed Identity ces-<env>-app-mi           ── KV Secrets User on the vault
└── Container Apps Environment     ces-<env>-cae
    ├── Container App: API         ces-<env>-api              ── ghcr.io/.../ces-api:<tag>
    └── Container App: Web         ces-<env>-web              ── ghcr.io/.../ces-web:<tag>
```

## SKU + cost notes

| Resource | SKU | Approx monthly cost (low usage) |
|---|---|---|
| Postgres Flexible | `Standard_B1ms` (Burstable, 1 vCPU, 2 GiB) | ~$25 + $5 storage |
| Container Apps | Consumption — auto-scale 1–3 replicas, 0.5 vCPU/1 GiB each | ~$20–60 |
| Log Analytics | Pay-as-you-go, 5 GiB free | ~$2 |
| Key Vault | Standard | <$1 |
| Storage | Standard_LRS, hot tier | ~$2 |
| **Total** | | **~$55–95/mo** |

When real traffic shows up, scale knobs to turn first: PG to `Standard_D2ds_v5`,
Container Apps min replicas to 2 across both apps, enable PG zone redundancy.

## Updating a deployment

```sh
# Roll a new image through both Container Apps (re-running deploy.sh is fine):
bash infra/deploy.sh

# Or update one app's image directly without touching infra:
az containerapp update --name ces-prod-api --resource-group ces-prod-rg \
  --image ghcr.io/ciscosoni/ces-api:sha-<short>
```
