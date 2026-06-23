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
  evidence/      Pure evidence helpers (perceptual-hash, ocr-parse, geo) — fraud-flag math
  forecast/      Pure predictive models (margin/utilization/spike/wellbeing) — P8
  excel/         xlsx import/export utilities
  config/        env loader + Azure Key Vault adapter
  tsconfig/      shared TypeScript configs
  eslint-config/ shared ESLint configs
infra/           Azure deploy: main.bicep + modules/, deploy.sh, seed-prod.sh (see DEPLOYMENT.md)
migration/workway/  Workway data migration: capture/pull scripts (.cjs) + import.ts / import-p9.ts,
                    with captured API fixtures under _discovery/ (source of the post-Workway P9 work)
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
pnpm --filter @ces/da-engine test -- -t "intra-city"   # single test by name (Vitest -t)
pnpm --filter @ces/da-engine test -- src/calculate.test.ts   # single test file

# Prisma (apps/api)
pnpm --filter @ces/api prisma:generate
pnpm --filter @ces/api prisma:migrate
pnpm --filter @ces/api prisma:studio
pnpm --filter @ces/api prisma:seed       # seed master data + sample rows — run before first local boot
```

If `pnpm` isn't on PATH: `corepack enable && corepack prepare pnpm@latest --activate`.

### Running & exercising locally

Local boot order: `docker compose up -d` → `prisma:migrate` → `prisma:seed` → `pnpm dev`. The seed is **required** before the UI is clickable — every entity ships with sample data (working method §12).

Auth resolves to **dev mode** locally (`AUTH_MODE` defaults to `dev` when no real tenant is configured — see `apps/api/src/auth/entra.ts`). The API guard (`auth.guard.ts`) trusts the **`X-Dev-User-Email`** request header, falling back to `DEV_AUTH_DEFAULT_EMAIL`, then `admin@cestech.in`. Because nearly every surface is role-gated (`ProjectsService.visibilityWhere`, `@Roles` guards), **the way to test a role is to send/seed a user with that role and pass their email in `X-Dev-User-Email`** — there is no login screen locally. The web app reverse-proxies the API through `apps/web/app/api/[...path]`, so set the dev email there (or via the proxy's env) when driving the UI as a non-admin. Entra JWT validation only engages once a real tenant is wired (`AUTH_MODE=entra`); `ALLOW_DEV_AUTH_IN_PROD=true` keeps the dev-header path usable in deployed environments behind an IP allowlist.

AI surfaces (`/ai/*`, agents, onboarding wizard) degrade to a **deterministic mock** when `ANTHROPIC_API_KEY` is unset — features stay clickable offline; only the narration differs. Schedulers/cron agents are gated by `SCHEDULER_DISABLED`.

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

**UI shell**: premium **light "glass" theme is the default** (2026-06-23) — frosted-glass surfaces (`.glass`/`.lift`), a soft aurora + faint-grid background, glossy buttons, blue→cyan AI accents, IBM Plex Sans/Mono. The dark "operations console" theme is **retained behind a `next-themes` toggle** (topbar sun/moon); both themes are driven by the same HSL + glass/shadow recipe tokens in `globals.css` (`--glass-bg`, `--shadow-card`, `--shadow-card-hover`, `--shadow-btn`), so one set of classes renders either theme. Motion: CSS `.reveal`/`.lift` + `AnimatedNumber` count-up KPIs, plus `framer-motion` for the per-route fade (`app/(app)/template.tsx`). Status colors are theme-aware (`text-{c}-700 dark:text-{c}-300`). Role badges in sidebar, `⌘K` command palette (`components/command-palette.tsx`), `Sparkline` + `AiBadge` primitives. New UI work follows `ui-ux-pro-max` rules (4.5:1 contrast, 150–300ms motion, reduced-motion support).

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

## 11. Delivery status

**Single source of truth for delivery status is `docs/IMPLEMENTATION_ROADMAP.md`** — the `P0–P8` roadmap, with a "current baseline" table of what's real, per-phase scope/exit-criteria, and a dependency map. It reconciles against `DEPLOYMENT.md` (cloud infra, Batches 1–5) and `docs/PRODUCT_AUDIT.md` (gap analysis). Do **not** re-track phase status in this file — it drifts. When picking up mid-build, read that doc + `git log`.

Roadmap shape (see the doc for each phase's scope):
`P0` Go-Live · `P1` Identity & Trust (Entra/Graph) · `P2` Evidence Layer · `P3` Automation Heartbeat · `P4` Mobile MVP · `P5` Ambient AI · `P6` Autonomous Agents · `P7` Reporting & Integrations · `P8` Predictive Intelligence.

> Older commits/docs use `Phase 0–3` (the original product-brief plan); that scheme is **retired** in favour of `P0–P8`. They do not line up — `P#` ≠ `Phase #`.

**Where it stands (2026-06):** core web workflows, the calc engines, the design system, and the AI onboarding wizard are functional. Shipped: `P2` evidence layer, `P3` scheduler + notification fabric, `P4` mobile MVP (bundles clean), `P1` identity (dual-mode code-complete — Entra JWT + Graph sync + web/mobile MSAL; flips on with a real tenant, dev-header fallback for local), **`P5` Ambient AI (L1–L2)** — Ask-AI drawer, email→expense auto-extraction, NL command palette, streaming onboarding wizard — **`P6` Autonomous Agents (L3)** — daily brief, anomaly-nudge, standup digest, and a **suggest-only** auto-approval evaluator (human still clicks Approve) — **`P7` Reporting** (core) — six xlsx reports + a Tally reimbursement export at `/finance/reports` — and **`P8` Predictive Intelligence** — the pure `@ces/forecast` models (margin/utilization/spike/wellbeing) behind `/forecast/*` and the dashboard's "Forward-looking risk" panel. **All feature phases P1–P9 are done.** **`P9` Operational & Billing Depth** added (post-Workway-migration): bill rates + billable time → T&M revenue (`pnl-engine`), client **invoicing** (`/finance/invoices`), **leave + holidays** (`/leave`), richer tasks (estimate/priority/labels), HR-lite lifecycle, vendor master, and a live start/stop **timer**. Remaining: **`P0` go-live** + the P7 integrations that need a live tenant (Teams/Outlook, SAP, true bank file) — both deferred *with* cloud. Per the user, **P0 + cloud deployment come last**.

### Shipped surfaces worth knowing (routes/endpoints/state not documented elsewhere)

- **Live P&L** — `apps/api/src/projects/pnl.service.ts`; per-project tabs: Overview, Tasks, Milestones, Team, P&L (baseline-vs-current after a CR).
- **Travel + DA** — request → approve → trip → close, live DA derivation in UI.
- **Receipts** — anti-fraud flags (`DUPLICATE_HASH`, `AMOUNT_OCR_MISMATCH`, `DATE_OUT_OF_TRIP`, `GPS_FAR_FROM_TRIP`) → Finance reimbursement queue. Evidence math lives in `packages/evidence`; pipeline in `apps/api/src/{receipts,storage}`.
- **Attendance** — `AttendanceEvent` ingest → derived `AttendanceDay` → engineer `AttendanceRegularization` (required justification); manager queue `/attendance/inbox` flips a day to `REGULARIZED` on approval.
- **Change Requests** — `ProjectBaseline` snapshot + scope/time/cost deltas; owner-only approval applies deltas and records `appliedSnapshot`.
- **Comments / Anomalies** — polymorphic `Comment` (PROJECT/TASK/EXPENSE/TRIP/CHANGE_REQUEST/RECEIPT/ATTENDANCE_REGULARIZATION) + `AnomalyRule` admin surface + detector `POST /anomalies/detect` (7 default rules); open anomalies surface on the leadership dashboard.
- **AI Onboarding Wizard** — `/projects/onboard`; `POST /ai/project-onboard/generate` calls Claude (adaptive thinking + JSON-schema output, seeded with live client/people/utilization context) → `POST /ai/project-onboard/commit` materializes project + milestones + tasks + allocations + baseline in one transaction. Deterministic mock fallback when `ANTHROPIC_API_KEY` is unset.
- **Billable-justification review (P10 #3a)** — defends T&M revenue ("is what they're doing actually billable?"). Pure `scoreBillableJustification()` in `@ces/evidence` (7 tests) scores each `billable: true` time log's `notes` → `SOLID | WEAK | MISSING` with reason codes (NO_JUSTIFICATION, GENERIC, TERSE, ECHOES_TASK, HIGH_HOURS_THIN_NOTE) — always-on, no LLM. `GET /projects/:id/billable-review` (visibility-enforced) surfaces the flagged hours a client would dispute first. A **suggest-only** AI second opinion, `POST /ai/classify-billable` (uses the cheaper **Haiku** `fastModel`, mock fallback), judges whether one log's work is plausibly client-billable (`BILLABLE|NON_BILLABLE|UNCLEAR`) — **never flips `billable`**. Surfaced as the "Billable hours at risk" panel (`components/billable-review-panel.tsx`) on the project P&L tab.
- **Estimation memory (P10 #3b)** — anchors a new estimate in what similar finished projects actually achieved. Pure `benchmarkEstimate()` in `@ces/forecast` (5 tests) takes closed-project actuals (realized margin + cost-by-category) and returns avg margin, margin range, **cost mix as % of revenue**, and — given the plan's forecast margin — an `OPTIMISTIC | CONSERVATIVE | INLINE` verdict (±5-pt tolerance). `GET /ai/onboard/estimate-benchmark?category=&marginPercent=` resolves actuals via the live P&L engine over closed same-category projects (capped 25); no LLM, no money decided. Surfaced as the "Estimation memory" panel in the onboarding wizard's review step. Completes P10 #3.
- **SOW/PO commercial-terms verification (P10 #2)** — `POST /ai/project-onboard/extract-terms` reads the **P&L-baseline** terms out of pasted SOW/PO text — client, end customer, billing model, contract value, currency, dates, milestones — returning each as a **cited** field (`{value, sourceQuote, confidence}`) plus `missing[]` (terms not in the doc → Owner must supply) and `warnings[]` (tax/dual-total/retention ambiguities). Evidence-by-default: nothing is guessed, every number traces to a verbatim quote. Surfaced as the "Verify commercial terms" panel on the wizard's input step (additive — doesn't touch generate→commit). Mock fallback. *Deferred:* PDF/file→text upload (no parsing dep yet; v1 takes pasted text like `extract-expense`).
- **Ask-AI drawer (P5)** — `POST /ai/ask {entityKind: EXPENSE|TRIP|PROJECT, entityId, question}`; `AiService.ask()` loads the record's real data + derivation (P&L breakdown, DA breakdown, fraud flags), enforces visibility (404 otherwise), and answers grounded in that data citing the numbers. Mounted on the project P&L page + expanded expense row (`components/ask-ai-drawer.tsx`). (TRIP is API-ready but has no web mount yet — the web Travel page is still a stub.) Same mock fallback.
- **Portfolio Ask-AI (P10 #5)** — `POST /ai/ask-portfolio {question}` (ADMIN/FINANCE). `AiService.askPortfolio()` grounds the answer in a **live portfolio snapshot** — per-project P&L (`dashboards.portfolio`), forward-looking margin forecasts/trajectories (`forecast.marginForecasts`), KPIs, open anomalies — and answers citing project codes + numbers. The prompt is explicit that it has no period-over-period history, so "why did Q2 drop"-type questions are answered via current state + ERODING/IMPROVING trajectory rather than invented trends. Surfaced as the "Ask the portfolio" drawer (`components/portfolio-ask-drawer.tsx`) in the leadership dashboard header. Read-only narration over the same engines the dashboard uses; mock fallback. **Completes the P10 AI Business Optimization track.**
- **Auto-extraction (P5)** — `POST /ai/extract-expense {text}` turns a pasted email/message/bill into a structured expense draft (grounds the project guess in active projects); surfaced as a "paste an email/message" affordance in the New Expense dialog.
- **NL command palette (P5)** — `POST /ai/command {query}` returns a short answer + ≤3 route suggestions (hrefs constrained to a catalog). Read-only — routes/answers, never mutates (autonomous actions are P6). Wired into the ⌘K palette (Enter to ask).
- **Streaming onboarding (P5)** — `POST /ai/project-onboard/generate/stream` (SSE) streams `status`→text deltas→final plan; the proxy (`app/api/[...path]`) passes `text/event-stream` through un-buffered; the wizard renders the draft live.
- **Autonomous agents (P6)** — `apps/api/src/agents/*`, self-scheduled via `@Cron` (gated by `SCHEDULER_DISABLED`), each runnable on demand at `POST /agents/{daily-brief,anomaly-nudge,standup}/run`. AI-narrated via `AiService.narrate()` with deterministic fallbacks. **Auto-approval has two modes** (admin-editable `AutoApprovalPolicy`, one deterministic `evaluate()` rule for both): (1) **suggest-only** (default) — `GET /agents/auto-approval/suggestions` surfaces clean expenses (badged in the expense inbox) for one-click human approval; (2) **confident** (P10 #4, opt-in `autoApprove` flag, default OFF) — auto-advances clean, in-policy, under-cap expenses through the **OWNER step only** (`SUBMITTED → OWNER_APPROVED`); **Finance still reviews every payout**. `runAutoApproval()` runs on an `@Cron` (hourly, gated by `SCHEDULER_DISABLED`) + on demand `POST /agents/auto-approval/run`; each auto-action writes an `AUTO_APPROVE_OWNER` audit row with a **null (system) actor** and sets `ownerApproverId = null`. Admin surface: `/admin/auto-approval` (kill switch + policy + run-now). No AI decides money — the rule is deterministic.
- **Reporting (P7)** — `apps/api/src/reports/*` → `/finance/reports`. Six `GET /reports/*.xlsx` exports (portfolio P&L, utilization, reimbursements, attendance, travel spend, payslips) built on the live dashboard/payslip computations via `@ces/excel`, plus `GET /reports/reimbursements-tally.xml` (Tally payment vouchers; ledger names via `TALLY_*` env). All `ADMIN`/`FINANCE`, served as attachments through the auth proxy.
- **Predictive Intelligence (P8)** — pure `packages/forecast` models (`forecastMargin`, `predictUtilizationConflicts`, `recommendStaffing`, `detectExpenseSpike`, `wellbeingSignal`; 18 unit tests, reason codes) behind `apps/api/src/forecast/*` → `GET /forecast/{summary,margins,utilization,staffing,expense-spike,wellbeing}` (ADMIN; `staffing` also PM/Owner). Surfaced as the leadership dashboard's "Forward-looking risk" panel. The forecast service does the I/O; the math stays pure in the package.
- **Staffing optimizer (P10 — resource optimization, first slice)** — `recommendStaffing()` in `@ces/forecast`: given next-month allocations + each engineer's grade + cost rate effective on the window, it returns a **capacity table** (overbooked / full / available / bench — "who's free?") and **advisory** whole-allocation reassignments that relieve overbooked engineers onto grade-matched peers (exact > ±1 band; cheapest-then-most-spare tie-break), each with reason codes and a per-day **cost-rate delta** (the P&L signal). Pure/greedy/explainable, never auto-assigns (a PM confirms). `GET /forecast/staffing`; surfaced as the dashboard's "Resource optimization" card. Part of the **P10 AI Business Optimization** track (consultant roadmap: ✅① staffing optimizer · ✅② SOW/PO intake · ✅③ billable-justification + estimation-memory · ④ confident auto-approval ✅4a / ⬜4b chat ingestion (live webhook deferred-with-cloud; per-expense paste already exists) · ✅⑤ portfolio "talk to your numbers"). **Track effectively complete** — only 4b's live WhatsApp/Teams webhook remains, deferred with cloud.
- **Automation** — `apps/api/src/scheduler` (cron heartbeat) + `apps/api/src/notifications` (delivery channels) + web topbar notification bell.
- **Payslip + Approvals** — line-by-line payslip derivation (traceable to source); central Approvals hub with SLA timers.
- **Workway-parity modules** (migration off the team's prior tool, `cestech.workway.pro`) — the web nav is restructured into Workway's tab groups (`Overview / CRM / Delivery / Field Ops / Approvals / Finance / People / Admin`, see `components/sidebar.tsx`). New modules: **Leads/CRM** (`apps/api/src/leads`, Kanban pipeline board `components/leads-board.tsx` at `/leads`; `scoreLead()` gives an explainable 0–100 score + next-best-action, no LLM; `POST /leads/:id/convert` → Client). **Timesheets** (`GET /time-logs` visibility-scoped aggregation in `tasks.service.listTimeLogs`; grid at `/timesheets`). **People** — employee directory `/people` + profile `/people/[id]` (`users.service.profile` derives allocations/leave/hours rollups). **HR org** — Departments + Designations master (`apps/api/src/org`, `/admin/{departments,designations}`, headcount derived from `User.department`/`jobTitle`). **Payroll** (`apps/api/src/payroll`) — `SalaryStructure` (components JSON; gross/net **computed** via `computePay()`), register at `/finance/payroll` with a missing-structure flag. **Orders** (`apps/api/src/orders`) — unified sales + purchase orders (`Order.kind = SALE|PURCHASE`; `partyId` resolves to Client or Vendor; line items JSON, totals **computed** via `computeOrderTotal`, auto `SO-`/`PO-` numbering); view at `/orders` with a Sales/Purchase toggle. Read-only directories for Clients (`/clients`), Holidays (`/holidays`). Remaining Workway tabs (Taskboard/Roadmap, and the niche tier — Tickets/Notices/Assets/KB/Recruit/Events/Performance/Letters/Bank/QR-Bio/Biometric/Webhooks/Zoom) are not yet built. The full Workway feature inventory + gap matrix drove this; specs/plans under `docs/superpowers/`.

## 12. Working method

- This is a multi-session build. Do not try to one-shot anything.
- For new modules: confirm scope against this doc + the brief, propose the slice, get sign-off, then build.
- Keep commits small and logical. Each module/PR should be independently runnable and testable.
- When something is ambiguous mid-build, **ask rather than guess** — especially anything that touches DA, P&L, approvals, or money flows.
- Seed sample data for every new entity so the UI is clickable immediately.
- The financially-sensitive / evidence / forecast packages (`da-engine`, `pnl-engine`, `approval-engine`, `evidence`, `forecast`) stay pure (no DB/I/O) and get unit tests **before** the API/UI that uses them.
- Every new module gets a sentence in this CLAUDE.md and a memory entry if it introduces non-obvious design context.
