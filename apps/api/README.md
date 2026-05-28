# @ces/api

NestJS REST API for the CES internal tool.

## Dev

```bash
cp ../../.env.example ../../.env   # if not already done
pnpm --filter @ces/api prisma:generate
pnpm --filter @ces/api dev
# → http://localhost:4000/api/health
# → http://localhost:4000/docs (Swagger)
```

## What's here in Phase 0

- `main.ts` + `app.module.ts` — Nest bootstrap, global `/api` prefix, Swagger at `/docs`
- `health.controller.ts` — `GET /api/health`
- `env.ts` — Zod-validated env loader (fails fast on missing config)
- `prisma/schema.prisma` — initial schema for users, grades, cost rates, cities, entitlement matrix, clients, projects, milestones, audit log

## What's next (Phase 0 continued)

- MSAL JWT validation guard (Entra ID, JWKS-RSA)
- Microsoft Graph user sync job
- RBAC decorator + guard
- Master-data CRUD modules (Grades, CostRates, Cities, EntitlementMatrix, Clients, EndCustomers, DaPolicy)
