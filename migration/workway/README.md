# Workway → CES Tool migration

One-time import of existing data from **Workway** (`cestech.workway.pro`) into this tool's
local dev database. Decided: load into local dev Postgres and keep it as the working dataset.

> **Claude can't log into Workway from its environment** (no browser session, can't solve the
> Google/OAuth flow). So the migration runs as a **local tool you execute** — your credentials stay
> on your machine and are never sent to Claude. All captured/exported data under `_discovery/` and
> `*.xlsx` is git-ignored (PII/financial); only the tool code is tracked.

## Path A (recommended) — automated capture via `capture.cjs`

This needs **no manual exporting and no password sharing**. It opens a real Chrome window; you log in
yourself; as you browse, it records the JSON the Workway app's own backend returns — which is the
structured data, cleaner than Excel.

```bash
node migration/workway/capture.cjs
```

1. A Chrome window opens at Workway. **Log in** (Google / email / 2FA — however you normally do).
2. **Open every module** you want migrated and **page through the long lists** so all rows load:
   People · Clients · Projects · Tasks · Timesheets · Allocations · Expenses · Travel · Attendance ·
   Reports.
3. Each JSON payload is saved to `migration/workway/_discovery/` with an `api-index.json` map.
4. When you've visited everything, **close the browser window**.
5. Tell Claude *"Workway capture is done"* → it reads the index, proposes the mapping, dry-runs, and
   imports on your approval.

If `api-index.json` comes out **empty**, Workway renders data server-side (no JSON API) — say so and
use Path B.

## Path B (fallback) — manual Excel export

Use Workway's **Advanced Reports → export to Excel (.xlsx)**. Export each module below and save it
with the exact filename shown (so the importer can find it). If a module's columns differ from the
guesses below, that's fine — Claude maps from the *actual* headers after inspecting the files.

| # | Save as | Workway module | Key columns we need |
|---|---|---|---|
| 1 | `people.xlsx` | Users / Team / HR | full name, email, job title, role, grade/band, manager (name or email), department, active? |
| 2 | `clients.xlsx` | Clients / Customers | name, type (SI / OEM if available) |
| 3 | `end-customers.xlsx` | End customers (if separate) | name |
| 4 | `projects.xlsx` | Projects | code, name, client, end customer, category, billing model, contract value, currency, start, end, project manager, owner, status, budget |
| 5 | `tasks.xlsx` | Tasks / Sub-tasks | project, task name, assignee, status, % complete, planned start/end, parent task |
| 6 | `timesheets.xlsx` | Timesheets / Time logs | user, project (and/or task), date, hours, notes |
| 7 | `allocations.xlsx` | Resource allocation (if available) | user, project, % allocation, period start, period end |
| 8 | `expenses.xlsx` | Expenses | user, project, category, amount, currency, date incurred, status, notes |
| 9 | `travel.xlsx` | Travel / Trips (if available) | user, project, from city, to city, start, end, travel/lodging/DA/local costs |
| 10 | `attendance.xlsx` | Attendance (if available) | user, date, status, hours / on-site time |

Export **everything you have**; skip the ones Workway doesn't hold. One file per module is ideal,
but a single multi-sheet workbook works too — just say so.

## What Claude does next (either path)

1. **Inspect** each file — print sheet names, headers, row counts, sample rows — and show you the
   proposed column → schema mapping for sign-off. No data is written yet.
2. **Build importers** (one per entity) under `migration/workway/` that map → our Prisma schema,
   **validate** every row, **dedupe** against what's already seeded (by email / project code / name),
   and write an **AuditLog** entry per insert.
3. **Dry-run** (`--dry-run`): report exactly what *would* be created/updated/skipped, with row-level
   warnings — nothing committed.
4. On your **approval**, run for real, in dependency order, in a transaction per entity.

## Order & caveats (why mapping isn't trivial)

- **Dependency order** (foreign keys): people → grades → clients/end-customers → projects → tasks →
  timesheets/allocations → travel → expenses → attendance.
- **Identity:** our `User` keys off a Microsoft **Entra object id** that only exists after a person
  signs in (or Graph sync runs). Imported people get a `pending:<email>` placeholder oid; their real
  oid links automatically on first Microsoft login or the next Graph sync. Manager chains are matched
  by email.
- **Master data:** grades, cost rates, city tiers, entitlement matrix and DA policy drive money math.
  If Workway doesn't carry these, projects/people import fine but **P&L / DA stay zero until an admin
  fills the master-data tables** (Workway likely won't have CES cost rates).
- **Money fields:** amounts are imported as-is with their currency; nothing is recomputed. Approval
  states are mapped to our enum where they line up, else imported as `DRAFT`/`SUBMITTED` for review.
- **Things that won't map:** Workway modules we don't model (e.g. Leads, Performance reviews, generic
  HR) are skipped — Claude lists what it dropped and why.

## Hand-off

When the files are in this folder, tell Claude "the Workway exports are in `migration/workway/`" and
it will start at step 2.1 (inspect + propose mapping).
