# CES Expense / PM Tool

Internal operations platform for **CES Tech (N-Expert Solutions Pvt. Ltd.)** — projects, tasks, attendance, travel, expenses, reimbursements, daily allowance, approvals, and project P&L. Web + mobile, signed in with Microsoft Entra ID.

The complete product brief lives at [`CES_Tech_Internal_Tool_ClaudeCode_Prompt.md`](./CES_Tech_Internal_Tool_ClaudeCode_Prompt.md). Engineering conventions, glossary, data model, and calculation rules live in [`CLAUDE.md`](./CLAUDE.md).

## Quick start

```bash
# 1. Enable pnpm (once)
corepack enable
corepack prepare pnpm@latest --activate

# 2. Install
pnpm install

# 3. Copy env
cp .env.example .env

# 4. Run everything in dev
pnpm dev
```

## Repo layout

```
apps/
  api/             NestJS REST API (Prisma + PostgreSQL)
  web/             Next.js 15 web app (App Router, Tailwind, shadcn/ui)
  mobile/          Expo React Native app
packages/
  domain/          Zod schemas + shared TypeScript types
  da-engine/       Daily Allowance calculator (pure, unit-tested)
  pnl-engine/      Project P&L roll-up (pure, unit-tested)
  approval-engine/ Generic approval workflow engine
  excel/           xlsx import/export utilities
  config/          env loader + Azure Key Vault adapter
  tsconfig/        Shared TypeScript configs
  eslint-config/   Shared ESLint configs
```

## Common commands

```bash
pnpm dev                              # run all apps in parallel
pnpm build                            # build everything
pnpm test                             # run all tests
pnpm lint                             # lint everything
pnpm typecheck                        # typecheck everything

pnpm --filter @ces/api dev            # API only
pnpm --filter @ces/web dev            # Web only
pnpm --filter @ces/mobile start       # Mobile (Expo)
pnpm --filter @ces/da-engine test     # Single package tests
```

## Status

**Phase 0 — Foundations** (in progress). See [`CLAUDE.md`](./CLAUDE.md) §9 for the phased delivery plan.
