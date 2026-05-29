# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The authoritative product brief lives at `CES_Tech_Internal_Tool_ClaudeCode_Prompt.md` — read it first if anything here is ambiguous.

---

## 1. What this repo is

Internal operations platform for **CES Tech (N-Expert Solutions Pvt. Ltd.)**, an IT infrastructure services company in Noida. Covers Project & Task Management, Attendance, Travel, Expense, Reimbursement, Daily Allowance, Approvals/Change Management, and Project P&L. Web + mobile. Single sign-on with Microsoft Entra ID.

## 2. Design constitution — why this tool exists

The founder named the pain points this tool must kill (full list in `project memory: pain_points`). They reduce to one root cause: **the company has no objective source of truth, so everything becomes a dispute** — receipts vs. memory, manager vs. engineer, finance vs. PM, leadership vs. leadership.

Three principles fall out and govern every design decision:

| Principle                         | What it means                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Evidence-by-default**           | Every action leaves an objective trace (GPS, geofence, photo EXIF, perceptual hash, calc audit). Nothing rests on "his word vs hers." |
| **Visibility-first**              | Live dashboards before forms. Anyone who matters sees the same data at the same moment.                                               |
| **Computed, never entered twice** | Payslip / DA / reimbursement / P&L are _derived_ from the evidence layer. Every number shows its derivation on tap.                   |

**Check every new feature against these three.** If it serves none, push back on scope. When making UX tradeoffs, visibility outranks minimalism — better to show 4 numbers with derivations than 1 number with mystery.

## 3. Stack (confirmed)

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

## 4. Repo layout

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

## 5. Common commands

All commands run from the repo root.

```bash
pnpm install                          # install all workspace deps
pnpm dev                              # turbo run dev (all apps in parallel)
pnpm build                            # turbo run build
pnpm test                             # turbo run test (Vitest)
pnpm lint                             # turbo run lint
pnpm typecheck                        # turbo run typecheck
pnpm format / pnpm format:check       # Prettier

# Local Postgres
docker compose up -d                  # start ces-postgres on :5432
docker compose down                   # stop

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

If `pnpm` isn't on PATH: `corepack enable && corepack prepare pnpm@latest --activate`.

## 6. Domain glossary

- **SI** — System Integrator (our direct client, e.g. NTT, Airtel Business, LTIMindtree)
- **OEM** — hardware/software vendor (Cisco, Arista, Palo Alto, Fortinet, Juniper, HPE Aruba)
- **End customer** — bank/airport/government/energy customer the SI/OEM sells to
- **White-label** — CES delivers under the SI's branding; CES identity hidden. Project flag.
- **TA** — Travel Allowance (mode/class entitlement + local conveyance cap)
- **DA / Per Diem** — Daily Allowance for being away on-site (food/incidentals)
- **Grade** — employee seniority band (L1 Junior Engineer … L5 Manager). Drives TA/DA, travel class, lodging caps.
- **City tier** — Metro/Tier-1, Tier-2, Tier-3, International. Combined with Grade to resolve DA + lodging caps.
- **Cost rate vs Bill rate** — internal day cost (P&L) vs client billing rate (revenue). P&L always uses **cost rate**.
- **T&M / Fixed Price / Milestone** — billing models on a Project.
- **CR** — Project Change Request that mutates scope/timeline/cost and feeds back into P&L (baseline vs current).
- **Project categories** — ACI, Non-ACI, SD-WAN, Security, Audit, Managed Services (NOC/SOC).

## 7. Module structure (mobile + web)

### Mobile (engineer-first, manager + leadership also supported)

```
Today    Default tab. Attendance status, today's tasks, DA running total,
         pending expenses, pending approvals (if manager).
Tasks    All my assigned tasks across projects. Tap to update % + blockers.
Travel   Active trip with live GPS distance + DA estimate. New trip request
         shows entitlements upfront. Past trips.
Expenses Snap receipt (camera → EXIF + OCR + perceptual hash). Pending /
         submitted / reimbursed. DA owed (computed, with derivation on tap).
Approvals (managers) Inbox with SLA timers; reject requires reason.
Profile  Payslip with line-by-line derivation. My entitlements. Compliance score.
```

### Web (by role)

```
LEADERSHIP      Live Ops map (who's where now), portfolio P&L (RAG + margin
                trend + burn), today's reimbursement outflow, anomalies feed.
PROJECT OWNER   Owns a project end-to-end. Sees only owned projects + their
                budget. First-level expense approver (before Finance).
PROJECT MGR     My projects (Gantt + Kanban toggle). Daily standup digest (auto).
                Resource allocation with conflict highlights. Live P&L. CRs.
                Does NOT create projects (Owner/Admin do).
FINANCE         Reimbursement queue (batch → bank file / Tally). Payslip
                generation (preview derivation before lock). DA payout summary.
                Second-level expense approver (after Owner).
ADMIN           Grades, cost rates, cities, entitlement matrix, DA policies.
                Approval workflows (visual builder). Clients, end customers.
                Users + role assignments.
```

Roles enum: `ADMIN, FINANCE, PROJECT_OWNER, PROJECT_MANAGER, APPROVER, ENGINEER`.
Project visibility filter lives in `ProjectsService.visibilityWhere(actor)` — ADMIN/FINANCE see all; OWNER sees owned; PM sees managed; ENGINEER sees assigned (via tasks/allocs).

**UI shell** (Phase 2A): Linear-style dark theme by default — HSL semantic tokens in `globals.css`, Inter font, gradient logo mark, role badges in sidebar, `⌘K` command palette (`components/command-palette.tsx`) for fuzzy nav, `Sparkline` + `AiBadge` primitives. New UI work follows `ui-ux-pro-max` rules (4.5:1 contrast, 150–300ms motion, reduced-motion support).

## 8. Core data model

See `packages/domain` for source-of-truth Zod schemas; `apps/api/prisma/schema.prisma` for the persisted shape. The schema is bigger than a typical brief because pain points #1 and #3 (fraud + opacity) drive several extra entities the brief didn't list.

**Identity & access**

- `User(azureOid, email, displayName, jobTitle, department, managerId, gradeId, roles[], active)`

**Master data (admin-editable, time-versioned)**

- `Grade(code, name, seniorityOrder)`
- `CostRate(gradeId, ratePerDay, currency, effectiveFrom)` — time-versioned
- `City(name, country, tier)`
- `EntitlementMatrix(gradeId, cityTier, perDiem, lodgingCap, travelClass, localConveyanceCap, effectiveFrom)` — time-versioned
- `DaPolicy(partialDayPercent, intraCitySameDayPaysDa, effectiveFrom)` — time-versioned
- `Client(name, kind: SI|OEM)`, `EndCustomer(name)`

**Projects**

- `Project(code, name, clientId, endCustomerId, whiteLabel, category, billingModel, contractValue, pmId, plannedStart, plannedEnd, includesPassthrough, status)`
- `ProjectSite(projectId, name, cityId, address)`
- `Geofence(projectSiteId, lat, lng, radiusMeters)` — defines "on-site" zones for attendance
- `Milestone(projectId, name, value, plannedDate, signedOffDate)`
- `Phase` / `Task` (tree: `parentId`, `assigneeId`, planned/actual, dependencies, %complete)
- `Allocation(userId, projectId, percentAllocation, periodStart, periodEnd)` — for capacity planning + overlap detection
- `TaskUpdate(taskId, userId, date, percentComplete, hoursLogged, blockers, body)` — daily standup post; rolls into TimeLog
- `TimeLog(taskId, userId, date, hours)` — feeds effort cost

**Attendance**

- `AttendanceEvent(userId, type, lat, lng, accuracy, timestamp, source)` — raw events: CHECK_IN, CHECK_OUT, GEOFENCE_ENTER, GEOFENCE_EXIT. Daily summary is derived.

**Travel & expense**

- `TravelRequest(userId, projectId, fromCityId, toCityId, dates, travelClass, tripType, status)`
- `Trip(travelRequestId, actuals, gpsTrail?, daEligibleDays, daAmount, costs by category)`
- `Expense(userId, projectId, tripId?, category, amount, currency, incurredOn, status)`
- `Receipt(expenseId, fileUrl, exifTimestamp, exifLat, exifLng, perceptualHash, ocrJson)` — separate from Expense so splits work
- `ReceiptFlag(receiptId, kind, severity)` — DUPLICATE_HASH, AMOUNT_OCR_MISMATCH, DATE_OUT_OF_TRIP, GPS_FAR_FROM_TRIP, SUSPICIOUS_VENDOR
- `Reimbursement(expenseIds[], userId, totalAmount, status, paidOn, reference)`

**Approvals & change**

- `ApprovalWorkflow / ApprovalStepDefinition` — admin-editable definitions
- `ApprovalInstance / ApprovalStepInstance` — runtime per item; with SLA timestamps
- `ChangeRequest(projectId, type, scope/time/cost deltas, status)`

**Payroll**

- `PayslipLine(userId, period, kind, amount, sourceKind, sourceId)` — every line traceable to its source record

**Collaboration & system**

- `Comment(entityKind, entityId, authorId, body, parentId)` — polymorphic; threaded
- `Notification(userId, kind, subjectKind, subjectId, channel, sentAt, readAt)` + `NotificationRule(trigger, channel, recipients)`
- `Anomaly(kind, severity, entityKind, entityId, detectedAt, resolvedAt)` — surfaces to leadership dashboard
- `AuditLog(entity, entityId, action, actorId, before, after, createdAt)` — every state change; soft-deletes everywhere

## 9. Calculation rules (must be correct — these decide real money)

### DA (Daily Allowance)

`DA = perDiem(grade, cityTier) × eligibleDays`

- Lookup uses the **EntitlementMatrix row effective on the trip date** (never hardcode amounts)
- First-day and last-day proration is **policy-driven** (e.g. 50% × per diem) — editable in admin
- Intra-city same-day work → no overnight DA; only local conveyance allowance applies (configurable)
- International cities are their own tier (allow foreign currency)
- DA result returned to UI **always includes per-day breakdown with reason codes** (FULL_DAY / DEPARTURE_DAY / RETURN_DAY / INTRA_CITY_NO_OVERNIGHT) so the engineer can see the math (principle #3)

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

- v1 is **services-only**. `Project.includes_passthrough` reserves the v2 hardware/OEM pass-through hook.
- All inputs are time-versioned: use the rate/matrix entry **effective on the relevant date**, not the current row.
- P&L `costBreakdown` returned to UI is the basis for the "tap to see derivation" leadership view (principle #3).

### Approvals

State machine: `Draft → Submitted → PendingApproval(step n) → Approved | Rejected → Settled/Closed`.

- Routing rules read from admin-editable workflow definitions (reporting manager from Azure AD, amount thresholds, project role, grade).
- Rejects **require a reason** (UX-enforced; engine accepts a `comment` field).
- Every step transition writes an `AuditLog` row.
- UI exposes SLA timers (how long pending) so silently-stuck items become visible.

**Expense-specific 2-step flow** (Phase 2B): `SUBMITTED → OWNER_APPROVED → APPROVED`. Step 1 is the project's `PROJECT_OWNER` (stored as `ownerApproverId`/`ownerApprovedAt`); step 2 is `FINANCE`. Either step can reject (records `rejectedById` + required reason). Inbox routing: `PROJECT_OWNER` sees Owner queue at `/expenses/inbox/owner`, `FINANCE`/`ADMIN` see Finance queue at `/expenses/inbox/finance`.

### Receipt fraud detection (Phase 1)

For every uploaded receipt, derive at upload time:

- **Perceptual hash** (e.g. pHash of the image) → flag DUPLICATE_HASH if matches another receipt by same or different user
- **OCR** → extract amount + date + vendor → flag AMOUNT_OCR_MISMATCH if entered amount > OCR-detected amount by configurable threshold
- **EXIF timestamp** → flag DATE_OUT_OF_TRIP if outside the linked trip's date window
- **EXIF GPS** → flag GPS_FAR_FROM_TRIP if more than configurable km from any project site on the trip
- Flags surface in the approver inbox **with explanation** — never silently rejected, never silently accepted.

## 10. Non-negotiables (don't shortcut these)

1. **No hardcoded amounts.** Grades, per-diems, caps, cost rates, approval thresholds are admin-editable master data.
2. **Time-versioning is mandatory** on CostRate, EntitlementMatrix, DaPolicy. A trip in March must use March's rate, even if changed in April.
3. **DA + P&L + approval engines stay pure and unit-tested.** No DB calls, no I/O. Inputs in, result out.
4. **No local username/password.** Sign-in is Microsoft only (MSAL/OIDC). Manager chain is sourced from Microsoft Graph.
5. **Soft-delete + audit log everywhere.** Financial records never hard-delete.
6. **All exports in `.xlsx`.** No CSV-only paths. Use `@ces/excel`.
7. **Multi-currency-ready** even though INR is default — never assume INR in code; always carry a currency code.
8. **Mobile must be offline-tolerant** — queue receipts/expenses when offline, sync on reconnect. Field sites have poor connectivity.
9. **Data residency: India.** Central India / South India Azure regions only.
10. **Every derived number ships with its derivation** — DA breakdown, P&L cost breakdown, PayslipLine.sourceKind/sourceId. Surfaces in UI on tap (principle #3).
11. **Rejects require a reason.** Both UX-enforced and recorded in `ApprovalStepInstance.comment` + `AuditLog`.

## 11. Phased delivery (revised after pain-point session)

- **Phase 0 — Foundations ✓:** monorepo, calc engines (`da-engine`, `pnl-engine`, `approval-engine`), Prisma schema + migrations, JWT/role guards (Entra wiring stubbed for local), audit/soft-delete plumbing, local Postgres via `docker-compose`, all 7 master-data modules end-to-end (Grades, CostRates, Cities, EntitlementMatrix, DaPolicies, Clients, EndCustomers), seed data.
- **Phase 1 — MVP (web slices done; mobile pending):**
  - **1A ✓** — Web foundation (Next.js App Router, shadcn/ui kit, sidebar/topbar, MSAL-stub auth) + admin CRUD for all 7 master-data resources.
  - **1B ✓** — Projects + Tasks + TimeLogs + Allocations + live P&L (`apps/api/src/projects/pnl.service.ts`); per-project tabs: Overview, Tasks, Milestones, Team, P&L.
  - **1C-α ✓** — Travel + DA: request → approve → trip → close, with live DA derivation surfaced in UI.
  - **1C-β ✓** — Expenses + per-project approvals (required reject reasons).
  - **1C-γ ✓** — Receipts with anti-fraud flags (DUPLICATE_HASH, AMOUNT_OCR_MISMATCH, DATE_OUT_OF_TRIP, GPS_FAR_FROM_TRIP) + Finance reimbursement queue.
  - **1D ✓** — Leadership Live Ops dashboard (KPIs + portfolio P&L + utilization + anomalies feed).
  - **1E ✓** — Payslip derivation (line-by-line, traceable to source) + Approvals hub.
  - **Mobile (not started)** — Today, Tasks, Trip-with-GPS, Receipts-with-EXIF+OCR+hash, Approval Inbox.
  - **Daily Standup auto-publish flow** (engineer → PM digest → leadership digest) — not started.
- **Phase 2 — in progress:**
  - **2A ✓** — Linear-style dark UI redesign (semantic tokens, command palette, sparklines, AI affordances).
  - **2B ✓** — `PROJECT_OWNER` role + per-project `ownerId`/`budget` + 2-step expense approval (Owner → Finance, with `OWNER_APPROVED` intermediate state).
  - **2C+ (not started)** — Geofenced Attendance regularization, Project CRs (baseline vs current), Anomaly detection rules, Allocation conflict detector, Polymorphic Comments, in-product Ask-AI (Cmd+K AI mode placeholder reserved).
- **Phase 3:** Tally / SAP / payroll integrations, Teams / Outlook notifications via Graph, Reporting/BI exports.

When picking up work mid-build, check `git log` + open tasks to see where Phase X stands.

## 12. Working method

- This is a multi-session build. Do not try to one-shot anything.
- For new modules: confirm scope against this doc + the brief, propose the slice, get sign-off, then build.
- Keep commits small and logical. Each module/PR should be independently runnable and testable.
- When something is ambiguous mid-build, **ask rather than guess** — especially anything that touches DA, P&L, approvals, or money flows.
- Seed sample data for every new entity so the UI is clickable immediately.
- The financially-sensitive packages (`da-engine`, `pnl-engine`, `approval-engine`) get unit tests **before** the API/UI that uses them.
- Every new module gets a sentence in this CLAUDE.md and a memory entry if it introduces non-obvious design context.
