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

## Batch 2 — CI + container registry (solo)

GitHub Actions for build + push, GHCR for image hosting (free for private repos).

- [ ] `.github/workflows/ci.yml` — typecheck + test + lint on every PR
- [ ] `.github/workflows/build.yml` — multi-arch `linux/amd64,linux/arm64` docker build, push to `ghcr.io/<owner>/ces-api` and `ces-web` on `main` and version tags
- [ ] pnpm + buildx layer caching for fast incrementals
- [ ] Image tags: `latest`, `sha-<short>`, `v<semver>` (from git tags)
- [ ] Branch protection note (require ci to pass before merge)
- [ ] Document GHCR pull-secret creation for Azure Container Apps

**Exit criteria:** push to `main` produces a pull-able image; tagging `v0.1.0` produces a versioned release image.

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
