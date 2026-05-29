# Deployment plan — production launch on Azure

**Target stack** (from CLAUDE.md §3, locked 2026-05-29):

- Azure Container Apps (Central India) — api + web
- Azure Database for PostgreSQL Flexible Server (Central India)
- Azure Key Vault — secrets
- Azure Storage Account — receipt blobs (Slice 4 of mobile flow)
- Azure Container Registry **or** GitHub Container Registry (GHCR)
- Microsoft Entra ID (CES Tech tenant) — sign-in
- Custom domain: `ops.ces-pl.com` (web) + `api.ops.ces-pl.com` (API)

**Rough monthly cost at <50 internal users:** ~$150–300/mo (PG Flexible B-tier is the biggest line item).

---

## Batch 1 — Production readiness baseline (solo) ✓

Code-only batch — nothing touches a cloud account yet. Goal: a `docker compose up` against the production images boots a working API + Postgres + web stack that behaves exactly like prod.

- [x] Multi-stage `Dockerfile` for `apps/api` (Node 22 alpine, pnpm, prisma generate, slim runtime)
- [x] Multi-stage `Dockerfile` for `apps/web` (Next.js `output: 'standalone'`)
- [x] `.dockerignore` at root and per-app
- [x] `docker-compose.prod.yml` — api + web + Postgres for local prod-mode testing
- [x] `apps/api` entrypoint runs `prisma migrate deploy` on startup, then boots the server
- [x] `apps/api/src/auth/auth.guard.ts` — production path stops falling back to dev-header; throws clear error if MSAL not yet wired (Batch 4 fills this in). `ALLOW_DEV_AUTH_IN_PROD` escape hatch documented for the period between Batch 3 and Batch 4.
- [x] `/health` (liveness, no DB) and new `/ready` (readiness, pings DB)
- [x] Structured JSON logging in production (pino) with request IDs + secret redaction
- [x] `next.config.mjs` — enable standalone output + workspace-root tracing
- [x] Hardened `.env.example` (no defaults, all secrets blank, with comments)
- [x] `pnpm build` + `pnpm typecheck` clean across all workspaces
- [ ] Smoke: docker compose up — **deferred** (Docker Desktop wasn't running at build time; will validate at the top of Batch 2)

**Exit criteria:** a fresh checkout, given valid env vars, runs end-to-end via `docker compose -f docker-compose.prod.yml up --build` against any Postgres.

---

## Batch 2 — CI + container registry (solo) ✓

GitHub Actions for build + push, GHCR for image hosting (free for public repos, this one is public).

- [x] `.github/workflows/ci.yml` — pnpm install, typecheck, lint (non-blocking), tests, build, **plus** a Docker build check that builds both production images without pushing on every PR
- [x] `.github/workflows/build-and-push.yml` — multi-arch `linux/amd64,linux/arm64` docker build, push to `ghcr.io/<owner>/ces-api` and `ces-web` on `main` + `v*.*.*` tags + manual dispatch
- [x] pnpm cache (via `pnpm/action-setup` + `setup-node@v4`) + GHA buildx layer cache (`type=gha`)
- [x] Image tags: `latest` (main only), `sha-<7>`, `v<semver>`, `<semver>`, `<major>.<minor>`, `<major>` (on tags)
- [x] Job summary surfaces the pull commands so finding the image is one tab away
- [x] Branch protection note (below)
- [x] GHCR public-package note (below) — no pull secret needed for Container Apps

**Exit criteria:** push to `main` produces a pull-able image; tagging `v0.1.0` produces a versioned release image.

### One-time post-Batch-2 setup (your action, after the first push)

1. **First push to main triggers `build-and-push.yml`.** Watch it at <https://github.com/ciscosoni/CES-Expense-PM-Tool/actions>. First multi-arch build takes ~8–12 min (cold cache); subsequent builds ~2–3 min.
2. **Make the GHCR packages public** so Container Apps in Batch 3 doesn't need a pull secret:
   - Go to <https://github.com/users/ciscosoni/packages> → click `ces-api`
   - **Package settings** (right sidebar) → **Change visibility** → **Public**
   - Repeat for `ces-web`
   - One-time only. New tags inherit the visibility.
3. **Branch protection on `main`** so CI must pass before merge:
   - Repo → **Settings** → **Branches** → **Add branch ruleset**
   - Targets: `main`
   - **Require status checks**: `Lint, typecheck, test, build` and `Docker build check`
   - **Require linear history** (recommended) + **Block force pushes**
4. **(Batch 3) Configure GitHub variables** for production `NEXT_PUBLIC_*` baking — repo → **Settings → Secrets and variables → Actions → Variables**:
   - `NEXT_PUBLIC_API_BASE_URL=https://api.ops.ces-pl.com`
   - `NEXT_PUBLIC_AZURE_TENANT_ID=<your tenant id>`
   - `NEXT_PUBLIC_AZURE_WEB_CLIENT_ID=<web app reg client id>`
   - These are read by `build-and-push.yml`; without them it falls back to placeholders that work but won't talk to real auth.

---

## Batch 3 — Azure provisioning + first deploy (together) — code ready ✓

Single-file Bicep + interactive bootstrap script. You run `az` interactively; code is committed.

- [x] `infra/main.bicep` — Resource Group, Log Analytics, Container Apps Environment, Postgres Flexible Server, Key Vault, Storage Account, **both** Container Apps (api + web), user-assigned managed identity with `Key Vault Secrets User` role assignment
- [x] `infra/main.parameters.example.json` — defaults you can copy
- [x] `infra/deploy.sh` — interactive one-shot: prompts for RG name + region + PG password (auto-generates if blank) + Anthropic key → `az group create` → `az deployment group create` → prints URLs + smoke-test commands
- [x] `infra/seed-prod.sh` — reads `DATABASE_URL` from Key Vault, runs `prisma migrate deploy && prisma db seed` against the managed PG
- [x] `infra/README.md` — resource map, cost table, update procedure
- [ ] **YOUR TURN:** run the runbook below
- [ ] Post-deploy: open the web URL, sign in as `admin@cestech.in` (dev-auth still on until Batch 4)

### Runbook — your steps from here

**Prereqs (one-time, on your laptop):**

```sh
brew install azure-cli            # macOS; Windows: https://aka.ms/installazurecliwindows
az login                           # browser opens — sign in with your CES tenant admin
az account list -o table           # confirm the subscription you want to use
az account set --subscription "<name or ID>"
```

**Wait for Batch 2's build to finish** (the workflow you triggered with the new PAT). Check the green tick at https://github.com/ciscosoni/CES-Expense-PM-Tool/actions. **Make both `ces-api` and `ces-web` packages public** at https://github.com/users/ciscosoni/packages — Container Apps won't be able to pull otherwise.

**Then, from the repo root:**

```sh
bash infra/deploy.sh
```

You'll be prompted for:
| Prompt | Default | Notes |
|---|---|---|
| Resource group name | `ces-prod-rg` | One RG per environment |
| Region | `centralindia` | Locked to India for data residency |
| Environment slug | `prod` | Affects resource names |
| GHCR owner | `ciscosoni` | Where the images live |
| API image tag | `latest` | `sha-XXXXXXX` for reproducibility |
| Web image tag | `latest` | Same |
| Postgres password | *(generated if blank)* | Copy + save somewhere — never logged anywhere else |
| Anthropic API key | *(blank ok)* | AI flows fall back to mock when blank |

First run takes **~6–10 minutes** (Postgres provisioning is the slow step). On success you'll see the live URLs and the smoke-test commands.

**Seed sample data** (one-time, optional):

```sh
# Allow your laptop's IP to talk to the managed PG (firewall rule):
MY_IP=$(curl -s ifconfig.me)
az postgres flexible-server firewall-rule create \
  --resource-group ces-prod-rg \
  --name "$(az postgres flexible-server list -g ces-prod-rg --query '[0].name' -o tsv)" \
  --rule-name laptop --start-ip-address "$MY_IP" --end-ip-address "$MY_IP"

# Run the seed:
bash infra/seed-prod.sh ces-prod-rg
```

**Smoke-test:**

```sh
# Use the URLs deploy.sh printed.
curl -fsS https://ces-prod-api.<random>.centralindia.azurecontainerapps.io/api/health
curl -fsS https://ces-prod-api.<random>.centralindia.azurecontainerapps.io/api/ready
```

**Exit criteria:** `https://ces-prod-api.../api/health` returns `{"status":"ok",…}`, `/api/ready` returns `{"checks":{"database":"ok"}}`, and the web URL serves the sign-in screen.

### Rolling a new image

After every push to `main`, GitHub Actions publishes new `latest` + `sha-XXXXXXX` tags. To pin one onto Container Apps:

```sh
az containerapp update --name ces-prod-api --resource-group ces-prod-rg \
  --image ghcr.io/ciscosoni/ces-api:sha-<short>
az containerapp update --name ces-prod-web --resource-group ces-prod-rg \
  --image ghcr.io/ciscosoni/ces-web:sha-<short>
```

Or just re-run `bash infra/deploy.sh` with new image tags — same effect, slower.

---

## Batch 4 — Real Entra ID auth + Azure Blob receipts (together)

- [ ] You: register an Entra app in the CES Tech tenant (multi-tenant: no; single-tenant: yes), give it the API audience + delegated Graph permissions (`User.Read`, `User.Read.All`)
- [ ] You: paste tenant ID + web client ID + API client ID → I update Key Vault + env
- [ ] API: replace dev-header AuthGuard with JWT validation via `jwks-rsa` (already in `package.json`)
- [ ] Web: MSAL React + PKCE flow
- [ ] Cron job: 6-hourly Graph user sync (users + manager chain)
- [ ] Receipts upload → Azure Blob with SAS-signed URLs (drops the placeholder `receiptUrl` field)
- [ ] CSRF middleware on state-changing routes
- [ ] Rate limiting: per-IP for unauthenticated, per-user for authenticated

**Exit criteria:** real CES Tech employees sign in with their Microsoft account; the dev-header path returns 401 in prod.

---

## Batch 5 — Domain (`ces-pl.com`), observability, backups (together)

- [ ] You: create CNAMEs `ops.ces-pl.com` → web Container App, `api.ops.ces-pl.com` → api Container App
- [ ] Container App custom domain + managed certificate binding
- [ ] App Insights wiring (auto-instrument both apps; track request latency, exceptions)
- [ ] (Optional) Sentry SDK for richer error context
- [ ] PG backup verification — Azure auto-backup is on by default; document the restore procedure end-to-end
- [ ] Status: `/status` endpoint that returns version + DB + dependent-service health
- [ ] One-pager runbook: how to roll forward, how to roll back, how to read logs

**Exit criteria:** `https://ops.ces-pl.com` serves the tool with a green padlock; App Insights shows live traffic; you can answer "what version is in prod?" in 10 seconds.

---

## Tracking

Each batch lands as one commit (or one short series) on `main` and updates the checkboxes above. After Batch 3 the prod environment is real but still locked to admins via Entra-test-mode + IP allowlist; after Batch 4 it's open to all CES Tech employees; after Batch 5 it's at the public production URL.
