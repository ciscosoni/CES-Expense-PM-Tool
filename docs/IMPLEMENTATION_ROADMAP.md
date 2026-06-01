# CES Tech Internal Ops — Implementation Roadmap

> Phase-wise plan to take the tool from its current state (strong foundation, early
> execution surface) to the north-star vision: **AI-native, low human intervention,
> good for company and employees.**
>
> Two tracks run in parallel and are reconciled here:
> - **Infra/Deploy track** — getting code to production on Azure (see `DEPLOYMENT.md`, Batches 1–5).
> - **Feature/Capability track** — the phases below (P0–P8), each an independently shippable release.
>
> Source of truth for product scope: `CLAUDE.md`. Source of truth for cloud infra: `DEPLOYMENT.md`.
> This file is the bridge. Last updated 2026-06-01.

---

## Legend

- 🟢 done · 🟠 partial / stubbed · 🔴 not started
- **Sizing** is indicative relative effort, not a commitment: **S** (days), **M** (1–2 wks), **L** (3–5 wks), **XL** (6+ wks).
- Every phase ends with an **exit criterion** and is **independently deployable** — no phase requires a later phase to be useful in prod.

---

## Current baseline (what's already real)

| Layer | State |
|---|---|
| Monorepo, CI, Docker images, Azure Bicep/IaC | 🟢 code-ready (DEPLOYMENT.md B1–B3) |
| Data model (audit, soft-delete, time-versioning) | 🟢 complete |
| Calc engines (DA / P&L / approval) — pure + unit-tested | 🟢 complete |
| Web app + design system (post-redesign) | 🟢 strong |
| Core web workflows (projects, tasks, expenses, attendance, travel approvals, reimbursements, payslips, change requests, anomaly rules) | 🟢 functional |
| AI project-onboarding wizard (Claude, real + mock fallback) | 🟢 functional |
| Identity (Entra ID / Graph) | 🟢 dual-mode code-complete (Entra JWT + Graph sync + web/mobile MSAL); flips on via tenant env, dev-header fallback for local |
| Evidence layer (Blob, OCR, pHash, EXIF-GPS) | 🟢 P2 shipped (storage + OCR + pHash + geofence flags) |
| Notifications (in-app / Teams / email) | 🟢 P3 shipped (notification fabric + topbar bell); Teams/email channels wire on via Graph |
| Background scheduler (cron) | 🟢 P3 shipped (anomaly sweep + Graph sync on cron) |
| Mobile app | 🟠 P4 MVP — 5 tabs, offline outbox, MSAL sign-in; bundles clean; not yet on devices/stores |
| Reporting / BI / xlsx export | 🔴 coming-soon |
| Integrations (Tally / SAP / payroll) | 🔴 absent |
| Ambient AI / agents | 🟠 P5 started — per-record "Ask AI" drawer shipped; auto-extraction, NL actions, agents pending |

---

## Phase overview

| Phase | Theme | Status | Sizing | Deploys to prod as |
|---|---|---|---|---|
| **P0** | Go-Live Foundation | 🔴 next — gated on `az login` + costs | M | First production environment (admin-locked) |
| **P1** | Identity & Trust | 🟢 code-complete — flips on with a real tenant | M | Real Microsoft sign-in for all employees |
| **P2** | Evidence Layer | 🟢 shipped | L | Self-validating receipts |
| **P3** | Automation Heartbeat | 🟢 shipped | M | Background jobs + alerts that reach people |
| **P4** | Mobile MVP | 🟠 MVP — bundles clean, not yet on devices/stores | L | iOS/Android app for field engineers |
| **P5** | Ambient AI (L1–L2) | 🟠 started — "Ask AI" drawer; auto-extract/NL/streaming pending | L | AI woven through every screen |
| **P6** | Autonomous Agents (L3) | 🔴 not started | L | "Low human intervention" realized |
| **P7** | Reporting & Integrations | 🔴 not started | L | Finance + leadership reporting; payroll sync |
| **P8** | Predictive Intelligence (L4) | 🔴 not started | XL | Proactive, predictive ops |

**Critical path:** P0 → P1 → P2/P3 (parallel) → P4 → P5 → P6. P7 and P8 can begin after P3 and P5 respectively.

---

## P0 — Go-Live Foundation
**Goal:** the tool that exists today, running in production on Azure, locked to admins.
**Reconciles with:** `DEPLOYMENT.md` Batches 1–3 (code-ready) + Batch 5 essentials (domain, observability, backups).

**Scope**
- Run `infra/deploy.sh` → provision Azure (Container Apps, PG Flexible, Key Vault, Storage, managed identity) in Central India.
- Run `infra/seed-prod.sh` → migrate + seed.
- Custom domain `ops.ces-pl.com` + `api.ops.ces-pl.com`, managed TLS.
- App Insights wiring, `/status` endpoint, PG backup/restore runbook.
- Stays on `ALLOW_DEV_AUTH_IN_PROD` + IP allowlist until P1.

**Gaps closed:** none feature-wise — this ships what's built.
**Exit:** `https://ops.ces-pl.com` serves the tool with a green padlock; App Insights shows traffic; admins can sign in.
**Your actions:** `az login`, register CNAMEs, approve resource costs (~$150–300/mo).

---

## P1 — Identity & Trust
**Goal:** real Microsoft sign-in; the people-graph that makes approvals route themselves.
**Reconciles with:** `DEPLOYMENT.md` Batch 4 (auth half).

**Scope**
- **Entra ID app registration** (single-tenant, API audience + delegated Graph `User.Read`, `User.Read.All`).
- **API:** replace dev-header `AuthGuard` with JWT validation via `jwks-rsa` (already a dependency).
- **Web + mobile:** MSAL PKCE flow (MSAL libs already present).
- **Microsoft Graph sync:** users + **manager chain** + job title + department (this is the unlock — approval routing reads the real manager instead of hardcoded rules).
- Security hardening: CSRF on state-changing routes, per-IP/per-user rate limiting, secret rotation in Key Vault.

**Files/areas:** `apps/api/src/auth/*`, new `apps/api/src/graph/*` (Graph client + sync service), `apps/web/lib/msal.ts`, `apps/mobile` auth.
**Gaps closed:** 🔴→🟢 Identity; turns approval-engine from "configured" to "auto-routing."
**Exit:** real CES Tech employees sign in with Microsoft; dev-header returns 401 in prod; approvals route to each person's actual Entra manager.
**Value:** company = correct routing + access control; employee = single sign-on, no new password.

---

## P2 — Evidence Layer (the differentiator)
**Goal:** a receipt stops being a typed number and becomes self-validating evidence. This is what no incumbent does out-of-the-box.

**Scope**
- **Azure Blob storage** for receipt files + SAS-signed URLs (drops the placeholder `fileUrl`).
- **OCR** (Azure AI Document Intelligence / vision) → extract vendor, amount, date, GST → populate `ocrJson` / `ocrAmount`.
- **Perceptual hash (pHash)** → near-duplicate detection (beyond today's exact SHA-256), cross-user.
- **EXIF GPS → geofence distance** → trigger the already-modeled `GPS_FAR_FROM_TRIP` flag.
- **Receipt → expense auto-fill**: snap a photo → category, amount, date, trip-match pre-filled; employee just confirms.
- Unit/integration tests for the receipts + fraud path (currently untested).

**Files/areas:** `apps/api/src/receipts/*`, new `packages/evidence/*` (pure pHash + geo-distance + OCR-normalize helpers, unit-tested), Blob adapter in `packages/config` or a new storage module.
**Gaps closed:** 🟠→🟢 Evidence layer; collapses expense data-entry.
**Exit:** uploading a receipt auto-creates a populated expense draft with fraud flags computed; duplicates and out-of-geofence receipts are flagged with explanations.
**Value:** company = real anti-fraud; employee = no typing, and the evidence protects *them* in disputes.

---

## P3 — Automation Heartbeat
**Goal:** the system does things on its own and tells the right people. Removes "a human must click Detect / chase approvals."

**Scope**
- **Scheduler** (`@nestjs/schedule`): nightly anomaly sweep, 6-hourly Graph sync (from P1), DA/accrual rollups, SLA-timer evaluation, daily-digest trigger.
- **Notification fabric**: in-app notification center + **Microsoft Teams / email via Graph** (and a channel abstraction so WhatsApp can slot in later). Wire the existing `Notification`/`NotificationRule` model to real delivery.
- Notify on: approval requests, anomaly detections (with recommended action), SLA breaches, reimbursement-paid, payslip-ready.
- In-app real-time updates (SSE or polling upgrade) for inbox badges.

**Files/areas:** new `apps/api/src/scheduler/*`, new `apps/api/src/notifications/*` (delivery channels), `apps/web` notification center UI + topbar bell.
**Gaps closed:** 🔴→🟢 Background automation + Notifications; closes the visibility loop.
**Exit:** an anomaly detected at 2am surfaces as a Teams message + in-app alert by morning, with a recommended action — no human triggered it.
**Value:** company = nothing falls through cracks; employee = no chasing, faster decisions.

---

## P4 — Mobile MVP
**Goal:** evidence is born in the field — capture it there. Offline-tolerant.

**Scope (per CLAUDE.md mobile module)**
- **Today** tab (attendance status, today's tasks, DA running total, pending approvals if manager).
- **Geofenced check-in/out** (the attendance evidence source).
- **Receipt capture** with EXIF + on-device queue → syncs to the P2 pipeline; offline-tolerant (queue + reconnect sync per non-negotiable #8).
- **Tasks** (update % + blockers) and **Trip with live GPS** + DA estimate.
- **Approval inbox** for managers on the go.
- MSAL React Native sign-in (from P1).

**Files/areas:** `apps/mobile/*` (currently scaffold only).
**Gaps closed:** 🔴→🟢 Mobile; completes the evidence layer's field half.
**Exit:** a field engineer checks in via geofence, snaps a receipt offline, and it syncs as a validated expense when back online.
**Value:** company = real-time field visibility; employee = the whole job done from a phone in seconds.

---

## P5 — Ambient AI (Levels 1–2)
**Goal:** AI everywhere, not one wizard. Reuses the existing Anthropic plumbing.

**Scope**
- **Auto-extraction everywhere:** email/WhatsApp/voice → structured travel request / expense / task update (forward a hotel bill or a message, AI drafts the record).
- **Per-record "Ask AI" drawer:** grounded Q&A on the specific entity ("why is this project's margin red?", "what's my DA for this trip?") — answers cite the derivation (your traceable data model makes this trustworthy).
- **NL command palette actions:** "approve all clean expenses under ₹2k", "show overbooked engineers next month".
- **Streaming** token-by-token in the onboarding wizard (CLAUDE.md remaining-2x item).

**Files/areas:** extend `apps/api/src/ai/*` (new endpoints + tool/agent definitions), `apps/web` "Ask AI" drawer + command-palette action handlers.
**Gaps closed:** 🟠→🟢 AI woven in (Levels 1–2).
**Exit:** every major record has an "Ask AI" affordance; an employee can create an expense by forwarding an email.
**Value:** company = decisions in natural language; employee = data entry mostly disappears.

---

## P6 — Autonomous Agents (Level 3) — the "low human intervention" payoff
**Goal:** the system handles the routine; humans handle only the exceptions.

**Scope**
- **Auto-approval agent:** expenses that are clean (OCR matches entry, GPS in geofence, within entitlement, no duplicate, under threshold) auto-approve; only ambiguous ones reach a human.
- **Daily-standup agent:** roll up task updates → PM digest → leadership digest, auto-written (CLAUDE.md's unbuilt "daily standup auto-publish").
- **Anomaly + nudge agent:** nightly sweep (from P3) → notify the right owner with a recommended action.
- **AI daily brief:** each leader/PM gets a morning brief (projects trending red, approvals breaching SLA, reimbursement due).
- Guardrails: every agent action writes an `AuditLog`; thresholds admin-configurable; humans can override.

**Files/areas:** `apps/api/src/ai/agents/*`, wire into scheduler (P3) + notifications (P3) + approval-engine.
**Gaps closed:** 🔴→🟢 Autonomous automation.
**Exit:** >70% of clean expenses auto-approve with full audit trail; standups and briefs publish without anyone writing them.
**Value:** company = managers freed from rubber-stamping; employee = paid faster, less waiting.

---

## P7 — Reporting, BI & Integrations
**Goal:** finance/leadership reporting + connect to the systems money actually flows through.

**Scope**
- **xlsx export everywhere** (non-negotiable #6) via `@ces/excel`: P&L, utilization, travel spend, attendance, reimbursement batches.
- **Reports module** (the coming-soon page) + leadership BI views.
- **Tally / SAP / payroll** export + sync (reimbursement bank files, payslip finalization/lock + PDF).
- **Teams / Outlook** deep integration via Graph (calendar-aware travel, meeting-note ingestion).

**Files/areas:** `apps/web/app/(app)/finance/reports`, `packages/excel`, new `apps/api/src/integrations/*`.
**Gaps closed:** 🔴→🟢 Reporting + integrations.
**Exit:** Finance exports a reimbursement bank file to Tally; leadership pulls any view as xlsx.
**Value:** company = closes the loop to accounting/payroll; employee = payslip PDFs, faster payouts.

---

## P8 — Predictive Intelligence (Level 4)
**Goal:** stop reacting, start predicting — the capability incumbents structurally can't match on your data.

**Scope**
- **Margin-erosion forecasting** per project (trajectory, not just current).
- **Utilization / allocation-conflict prediction** (next month's overbookings before they happen).
- **Expense-spike / fraud-pattern prediction** (anomaly *prediction*, not just detection).
- **Employee wellbeing signals** from attendance + task load (overwork/attrition risk) — framed for the *employee's* benefit.

**Files/areas:** new `packages/forecast/*` (pure, testable models) + AI service, dashboard surfaces.
**Gaps closed:** 🔴→🟢 Predictive (Level 4).
**Exit:** leadership dashboard shows forward-looking risk, not just current state.
**Value:** company = proactive risk management; employee = workload fairness flagged early.

---

## Quick wins (can be slotted into P3/P5 early — high impact, low effort)

| Win | Effort | Depends on |
|---|---|---|
| Nightly cron for the existing anomaly detector | S | P3 scheduler |
| OCR on receipt upload (single managed vision call) | S–M | P2 Blob |
| "Ask AI" per-record drawer (reuses Anthropic plumbing) | S–M | — |
| Auto-approval for clean expenses | M | P2 + P5 |
| Streaming in onboarding wizard | S | — |

---

## Dependency map

```
P0 ──► P1 ──┬─► P2 ──┐
            └─► P3 ──┼─► P4 ──► P5 ──► P6
                     │                  │
                     └──────► P7 ◄──────┘
                                        │
                                        └─► P8
```

## Notes on sequencing
- **P1 is the true unlock** — almost every automation/AI capability depends on real identity + the manager graph.
- **P2 and P3 can run in parallel** (different surfaces: evidence vs. scheduler/comms).
- **Don't start P6 before P2+P3+P5** — autonomous approval needs the evidence (P2) to judge "clean", the scheduler/notifications (P3) to act/inform, and the AI plumbing (P5).
- Keep the **employee-positive framing** front-and-center in every phase (faster pay, no busywork, dispute protection, transparency) — not surveillance.
