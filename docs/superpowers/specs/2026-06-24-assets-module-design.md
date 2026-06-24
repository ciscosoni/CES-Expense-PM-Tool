# Assets module — design (Workway niche tier)

**Status:** design approved (Approach A), spec written, **not yet implemented**. Paused to do the Azure deployment first. Resume here.

## Why / scope

Asset register for an IT-infra services company with field engineers carrying gear. Confirmed scope (decided with the user):

- **Full lifecycle**: procurement → assignment → maintenance → depreciation → disposal.
- **Depreciation**: straight-line, **computed** (never stored), shown on tap. No GL/journal entries.
- **Custody evidence**: on assign, the **employee acknowledges receipt** (timestamped by them); on return, captor records condition + note; **optional photo** of the handover (reuse the Azure Blob + SAS pipeline). Immutable history row each way.
- **Access**: ADMIN manages master/categories/assign/return; FINANCE gets the valuation/depreciation register; every employee sees "My assets" + acknowledges. No new role.

Fits the design constitution: **evidence-by-default** (immutable custody, kills "I returned it" disputes) + **computed-never-entered-twice** (derived depreciation).

## Approach A (chosen)

Normalized model + immutable custody history + admin-editable category master + a pure `computeDepreciation()` colocated in the compact module (same precedent as `computeOrderTotal` / `computePay`). Rejected: B (one fat row w/ JSON history — mutable, breaks evidence + valuation queries) and C (full fixed-asset accounting — over-scope, violates non-negotiable #10 "derive, don't store").

## Data model (Prisma; all soft-delete via `deletedAt`, audited)

```
AssetCategory  (admin-editable master — non-negotiable #1)
  id, name, defaultUsefulLifeYears Int, deletedAt

Asset
  id, tag (unique, auto "AST-0001"), name, categoryId, serialNumber?
  status: IN_STOCK | ASSIGNED | IN_REPAIR | RETIRED | LOST
  -- procurement --   vendor?, purchaseCost Decimal, purchaseDate, currency (Char3)
  -- depreciation --  usefulLifeYears Int, salvageValue Decimal @default(0)
  -- disposal --      disposedOn?, disposalValue?, disposalNote?
  notes?, createdById?, timestamps, deletedAt

AssetAssignment  (immutable custody trail — one OPEN row = current holder)
  id, assetId, userId (holder)
  assignedAt, assignedById
  acknowledgedAt?        -- set by the holder themselves (the evidence)
  photoUrl?              -- optional handover photo (Blob + SAS)
  returnedAt?, returnedToById?, returnCondition? (GOOD|DAMAGED|LOST), returnNote?

AssetMaintenance  (repair/service log)
  id, assetId, openedAt, openedById, description
  cost? Decimal, vendor?, status (OPEN|CLOSED), closedAt?, notes?
```

- **Current holder** = the open `AssetAssignment` (no `returnedAt`). Never a denormalized field.
- **Derived, never stored** — pure `computeDepreciation(asset, asOf)`: straight-line `annual = (purchaseCost − salvageValue) / usefulLifeYears`; returns `{ accumulatedDepreciation, bookValue (clamped ≥ salvage), annualDepreciation, ageMonths, fullyDepreciated, breakdown[] }`. Unit-tested first (TDD): straight-line, salvage clamp, fully-depreciated, partial-year, mid-life disposal, zero-life guard.

## API (compact `apps/api/src/assets/assets.module.ts`, mirrors orders/payroll)

| Endpoint | Role | Purpose |
|----------|------|---------|
| `GET /assets` (filter status/category/holder) | ADMIN, FINANCE | register list |
| `GET /assets/:id` | ADMIN, FINANCE | detail + holder + computed depreciation + history + maintenance |
| `POST /assets` · `PATCH /assets/:id` | ADMIN | create / edit master + procurement |
| `POST /assets/:id/assign {userId}` | ADMIN | open custody row (→ASSIGNED) |
| `POST /assets/:id/acknowledge` | holder (self) | sets `acknowledgedAt` — the evidence |
| `POST /assets/:id/return {condition, note}` | ADMIN | close custody row (→IN_STOCK) |
| `POST /assets/:id/maintenance` · `PATCH …/maintenance/:mid` | ADMIN | open/close repair (→IN_REPAIR) |
| `POST /assets/:id/dispose {disposalValue, note}` | ADMIN | →RETIRED |
| `GET /assets/mine` | any employee | my assets + ack |
| `GET /assets/valuation` | FINANCE, ADMIN | book-value register (Σ bookValue by category) |
| `GET/POST/PATCH /assets/categories` | ADMIN | category master |

Every assign/return/dispose writes an `AuditLog` row. Photo upload reuses the `storage` SAS pipeline.

## Web (light-glass theme)

- `/assets` — register table (tag, name, category, status, holder, book value) + filters + create dialog; row → detail drawer with assign / return / maintenance / dispose actions and the depreciation derivation inline.
- `/people/[id]` + a "My Assets" card — self-view + **Acknowledge receipt** button.
- `/finance` valuation register — book value rollup by category.
- **Sidebar:** "Assets" under **Admin**; valuation link under **Finance**.

## Build phasing (each slice independently runnable + tested)

1. **Procurement + depreciation** — `Asset` + `AssetCategory`, register CRUD, pure `computeDepreciation` (TDD first), valuation register, seed data.
2. **Custody evidence** — assign / acknowledge / return + immutable history, My Assets self-view, photo upload.
3. **Maintenance + disposal** — repair log + disposal flow.

## Resume note

Design approved by the user; next step per the brainstorming flow is **writing-plans** → implement Slice 1 (TDD on `computeDepreciation` first). It's the recommended first module of the Workway "niche tier" (highest value / cleanest evidence fit; the rest of the tier is heavy HR or integration-shaped → defer with cloud).
