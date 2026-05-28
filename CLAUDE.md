# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The authoritative product brief lives at `CES_Tech_Internal_Tool_ClaudeCode_Prompt.md` — read it first if anything here is ambiguous.

---

## 1. What this repo is

Internal operations platform for **CES Tech (N-Expert Solutions Pvt. Ltd.)**, an IT infrastructure services company in Noida. Covers Project & Task Management, Attendance, Travel, Expense, Reimbursement, Daily Allowance, Approvals/Change Management, and Project P&L. Web + mobile. Single sign-on with Microsoft Entra ID.

## 2. Stack (confirmed)

| Layer         | Tech                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| Monorepo      | Turborepo + pnpm workspaces, TypeScript end-to-end                        |
| Backend       | NestJS, Prisma ORM, REST (OpenAPI generated)                              |
| Web           | Next.js 15 (App Router) + Tailwind + shadcn/ui                            |
| Mobile        | React Native (Expo SDK) + EAS Update + MSAL React Native                  |
| Database      | PostgreSQL (Azure Database for PostgreSQL Flexible Server, Central India) |
| Auth          | Microsoft Entra ID via MSAL (web & mobile), JWT validation on API         |
| User sync     | Microsoft Graph (users, manager chain, job title)                         |
| Files         | Azure Blob Storage (receipts), SAS-signed URLs                            |
| Hosting       | Azure Container Apps (API), Azure Static Web Apps / App Service (web)     |
| Secrets       | Azure Key Vault + App Configuration                                       |
| Observability | Application Insights + structured logs                                    |

## 3. Repo layout

```
apps/
  api/           NestJS API
  web/           Next.js 15 web app
  mobile/        Expo React Native app
packages/
  domain/        Zod schemas + shared TS types (single source of truth)
  da-engine/     Daily Allowance calculator (pure, unit-tested)
  pnl-engine/    Project P&L roll-up (pure, unit-tested)
  approval-engine/  Generic approval workflow engine
  excel/         xlsx import/export utilities
  config/        env loader + Azure Key Vault adapter
  tsconfig/      shared TypeScript configs
  eslint-config/ shared ESLint configs
```

## 4. Common commands

All commands run from the repo root.

```bash
pnpm install            # install all workspace deps
pnpm dev                # turbo run dev (all apps in parallel)
pnpm build              # turbo run build
pnpm test               # turbo run test (Vitest in packages)
pnpm lint               # turbo run lint
pnpm typecheck          # turbo run typecheck

# Scoped to one workspace:
pnpm --filter @ces/api dev
pnpm --filter @ces/web dev
pnpm --filter @ces/mobile start
pnpm --filter @ces/da-engine test
pnpm --filter @ces/pnl-engine test -- --watch    # single-package watch

# Prisma (apps/api)
pnpm --filter @ces/api prisma:generate
pnpm --filter @ces/api prisma:migrate
pnpm --filter @ces/api prisma:studio
```

If `pnpm` isn't on PATH, enable it once: `corepack enable && corepack prepare pnpm@latest --activate`.

## 5. Domain glossary (interpret requirements through this)

- **SI** — System Integrator (our direct client, e.g. NTT, Airtel Business, LTIMindtree)
- **OEM** — hardware/software vendor (Cisco, Arista, Palo Alto, Fortinet, Juniper, HPE Aruba)
- **End customer** — bank/airport/government/energy customer the SI/OEM sells to
- **White-label** — CES delivers under the SI's branding; CES identity hidden. A project carries this flag.
- **TA** — Travel Allowance (mode/class entitlement + local conveyance cap)
- **DA / Per Diem** — Daily Allowance for being away on-site (food/incidentals)
- **Grade** — employee seniority band (e.g. L1 Junior Engineer … L5 Manager). Drives TA/DA limits, travel class, lodging caps.
- **City tier** — Metro/Tier-1, Tier-2, Tier-3, International. Combined with Grade to resolve DA + lodging caps.
- **Cost rate vs Bill rate** — internal day cost (P&L) vs client billing rate (revenue). P&L always uses **cost rate**.
- **T&M / Fixed Price / Milestone** — billing models on a Project.
- **CR** — Project Change Request that mutates scope/timeline/cost and feeds back into P&L (baseline vs current).
- **Project categories** — ACI, Non-ACI, SD-WAN, Security, Audit, Managed Services (NOC/SOC). Selectable metadata.

## 6. Core data model (load-bearing entities)

See `packages/domain` for the source-of-truth Zod schemas. High-level shape:

- **User** — `azure_oid, email, name, job_title, department, manager_id, grade_id, roles[], cost_rate, active`
- **Grade** + **CostRate(grade_id, rate, effective_from)** — cost rates are time-versioned
- **City(name, tier)** + **EntitlementMatrix(grade_id, city_tier, per_diem, lodging_cap, travel_class, local_conveyance_cap, effective_from)** — matrix is time-versioned
- **Client (SI/OEM)** and **EndCustomer** — two distinct parties on a project
- **Project** — `client_id, end_customer_id, white_label, category, billing_model, contract_value, pm_id, planned_start, planned_end, status` + **ProjectSite[]**
- **Milestone(project_id, name, value, planned_date, signed_off_date)**
- **Phase / Task** — tree with `parent_id`, `assignee_id`, planned/actual dates, dependencies, %complete + **TimeLog(task_id, user_id, date, hours)**
- **Attendance(user_id, date, type, check_in, check_out, geo_lat/lng)**
- **TravelRequest** + **Trip(travel_request_id, actuals, gps_trail?, da_days, da_amount)**
- **Expense(user_id, project_id, trip_id?, category, amount, currency, date, receipt_url, status)** + **Reimbursement(expense_ids[], payout_status, paid_on, reference)**
- **ChangeRequest(project_id, type, scope/time/cost deltas, status)**
- **ApprovalWorkflow / ApprovalStep / ApprovalInstance** — generic engine, used by all approvable items
- **ProjectFinancials** — computed/rolled-up view (revenue, planned/actual cost by category, gross_profit, margin)
- **AuditLog(entity, action, actor, before/after, timestamp)** — soft-delete + full history everywhere

## 7. Calculation rules (must be correct — these decide real money)

### DA (Daily Allowance)

`DA = perDiem(grade, cityTier) × eligibleDays`

- Lookup uses the **EntitlementMatrix row effective on the trip date** (never hardcode amounts)
- First-day and last-day proration is **policy-driven** (e.g. 50% × per diem) — editable in admin, not in code
- Intra-city same-day work → no overnight DA; only local conveyance allowance applies
- International cities are their own tier (allow foreign currency)

### P&L (Project)

```
Revenue        = contract_value (Fixed Price)
               | Σ signed_off milestone values (Milestone)
               | Σ time-billed × bill_rate (T&M)
Cost           = Σ effort_cost + travel + DA + lodging + expenses + other_direct
EffortCost     = Σ TimeLog.hours × CostRate(user.grade, log_date)  [cost rate as of log date]
GrossProfit    = Revenue − Cost
Margin %       = GrossProfit / Revenue × 100
```

- v1 is **services-only**. A `Project.includes_passthrough` boolean reserves the hook for v2 hardware/OEM pass-through.
- All inputs are time-versioned: use the rate/matrix entry **effective on the relevant date**, not the current row.

### Approvals

Generic state machine: `Draft → Submitted → PendingApproval(step n) → Approved | Rejected → Settled/Closed`.
Routing rules read from admin-editable workflow definitions (manager from Azure AD, amount thresholds, project role, grade). Every transition writes an `AuditLog` row.

## 8. Non-negotiables (these have caused real bugs in similar systems — don't shortcut them)

1. **No hardcoded amounts.** Grades, per-diems, caps, cost rates, approval thresholds are all admin-editable master data.
2. **Time-versioning is mandatory** on CostRate and EntitlementMatrix. A trip in March must use March's rate, even if changed in April.
3. **DA + P&L engines stay pure and unit-tested.** No DB calls, no I/O. Inputs in, number out. Tests cover proration, half-day rules, currency, mid-trip rate changes.
4. **No local username/password.** Sign-in is Microsoft only (MSAL/OIDC). Manager chain is sourced from Microsoft Graph, not entered manually.
5. **Soft-delete + audit log everywhere.** Financial records never hard-delete.
6. **All exports in `.xlsx`.** No CSV-only paths. Use the shared `@ces/excel` package.
7. **Multi-currency-ready** even though INR is default — never assume INR in code; always carry a currency code.
8. **Mobile must be offline-tolerant** — queue receipts/expenses when offline, sync on reconnect. Field sites have poor connectivity.
9. **Data residency: India.** All Azure resources in Central India / South India.

## 9. Phased delivery

- **Phase 0 — Foundations:** monorepo + Entra SSO + Graph sync + RBAC + Master data + DA/P&L/Approval engines + audit/soft-delete + CI
- **Phase 1 — MVP:** Projects & Tasks, Travel + DA, Expense + Reimbursement (all wired through Approval engine)
- **Phase 2:** Attendance (geofenced), Project CRs, Leadership P&L dashboard, full reporting
- **Phase 3 — Integrations:** Teams notifications, Outlook mail, Tally, SAP, payroll system

When picking up work mid-build, check `git log` and the open tasks to see where Phase X stands.

## 10. Working method (from §10 of the brief)

- This is a multi-session build. Do not try to one-shot anything.
- For new modules: confirm scope against the brief and CLAUDE.md, propose the slice, get sign-off, then build.
- Keep commits small and logical. Each module/PR should be independently runnable and testable.
- When something is ambiguous mid-build, **ask rather than guess** — especially anything that touches DA, P&L, approvals, or money flows.
- Seed sample data for every new entity so the UI is clickable immediately.
- The financially-sensitive packages (`da-engine`, `pnl-engine`, `approval-engine`) get unit tests **before** the API/UI that uses them.
