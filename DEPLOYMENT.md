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

## Batch 3 — Azure provisioning + first deploy (together)

Bicep IaC that provisions every Azure resource and deploys the api + web. You run `az login` and the deployment command; I write the templates and walk you through it.

- [ ] `infra/main.bicep` — Resource Group, Log Analytics, Container Apps Environment, Postgres Flexible Server, Key Vault, Storage Account
- [ ] `infra/containerapp-api.bicep` — Container App with managed identity, KV secret refs, ingress
- [ ] `infra/containerapp-web.bicep` — same for web
- [ ] `infra/parameters.<env>.json` — dev/staging/prod parameter files
- [ ] One-shot bootstrap script: provision → run migrations → seed → smoke-test
- [ ] Document `az deployment sub create` invocation

**Together-step:** you click "Add Subscription", I give you the exact commands, you paste output back to me.

**Exit criteria:** `https://ces-api.thankful-X.centralindia.azurecontainerapps.io/api/health` → 200, the web URL serves login.

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
