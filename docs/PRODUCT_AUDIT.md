# CES Tech Internal Ops — Product Audit & Competitive Benchmark

> Snapshot 2026-05-30. Benchmarked against Odoo, Zoho One, Atlassian (Jira/Confluence)
> against the north star: **AI-native, low human intervention, good for company and employees.**
> Companion to `docs/IMPLEMENTATION_ROADMAP.md`.

## Verdict

A **strategically differentiated product with a strong foundation but an early-stage execution
surface.** The domain model, the pure/tested calc engines (DA, P&L, approval), and the polished
UX are more *purpose-built* than anything Odoo/Zoho/Jira offer for the pain being solved (disputes
from no source of truth). But the "evidence-by-default" and "AI-native" promises are mostly not
wired: identity (Entra), the manager graph, blob storage, OCR/pHash/GPS validation, notifications,
the scheduler, and the entire mobile app are stubbed or absent. AI is **real but single-use** — only
the project-onboarding wizard calls Claude. The work that remains is the **AI/evidence/automation
nervous system** — exactly what turns this from "a nicer Zoho" into something incumbents can't match.

## Maturity scorecard

| Capability area | State | Score |
|---|---|---|
| Domain model & data integrity (audit, soft-delete, time-versioning) | Excellent | 🟢 9/10 |
| Calc engines (DA / P&L / approval) — pure, unit-tested | Excellent | 🟢 9/10 |
| Web UX / design system | Strong (post-redesign) | 🟢 8/10 |
| Core workflows (projects, tasks, expenses, attendance, travel approvals, reimbursements, payslips) | Functional web slices | 🟢 7/10 |
| Identity & people graph (Entra ID, Graph manager-chain, role sync) | Dev-stub only; prod 401s | 🔴 2/10 |
| Evidence layer (Blob, OCR, pHash, EXIF-GPS geofence) | SHA-256 + EXIF-timestamp only | 🟠 3/10 |
| AI / automation (ambient intelligence, agents) | One wizard; rules engine on-demand | 🟠 3/10 |
| Notifications & comms (email/Teams/WhatsApp/in-app) | Not wired | 🔴 1/10 |
| Background automation (cron, digests, sweeps, sync) | None | 🔴 1/10 |
| Mobile (field capture) | Scaffold only | 🔴 1/10 |
| Reporting / BI / xlsx export | Coming-soon | 🔴 2/10 |
| Integrations (Tally/SAP/payroll) | Absent | ⚪ 0/10 |

**Overall ≈ Phase 1.8 of the build.** The "spine" is done; the "nervous system" (sensing via
evidence, acting via AI/automation, communicating via notifications) is the gap.

## Confirmed current state (evidence-backed)

- **Claude/LLM:** REAL but single-use — `apps/api/src/ai/ai.service.ts`, model `claude-opus-4-7`,
  structured output + adaptive thinking + deterministic mock fallback when key unset. Only the
  onboarding wizard.
- **Receipt fraud:** PARTIAL — SHA-256 exact-duplicate + EXIF-timestamp window check are REAL;
  perceptual hash, OCR extraction, and EXIF-GPS→geofence distance are STUBBED (schema columns exist,
  nothing populates them).
- **Anomaly detection:** RULE-BASED, on-demand endpoint (`GET /anomalies/detect`), no cron, no ML.
- **Entra ID auth:** STUB — dev `X-Dev-User-Email` header; production path throws 401 (Batch 4).
- **Microsoft Graph:** NOT PRESENT (no user/manager sync).
- **Azure Blob:** placeholder URL only; no upload.
- **Notifications:** no delivery channel wired (no email/Teams/WhatsApp/in-app).
- **Scheduler/cron:** none (`@nestjs/schedule` not used).
- **Calc engines:** pure + unit-tested (da-engine, pnl-engine, approval-engine).
- **Mobile:** scaffold only (single placeholder screen).
- **Reports / Tally / SAP / payroll:** absent.
- **API breadth:** ~28 modules covering the full domain.

## Vs the industry leaders

| Dimension | Odoo | Zoho One | Atlassian (Jira) | CES Tool |
|---|---|---|---|---|
| Breadth | Huge (ERP) | Huge (45+ apps) | Deep PM/ITSM | Narrow, **purpose-built** |
| Fit to CES's pain | Generic | Generic | PM-centric | **Native** |
| Evidence/anti-fraud | Add-on OCR | Expense OCR | N/A | **Designed for it** (unbuilt) |
| "Computed, not entered" | Partial | Partial | Manual | **Core thesis** (engines done) |
| Native AI | Weak | Zia (broad) | Atlassian Intelligence / Rovo (agentic) | One wizard; clean substrate |
| Automation engine | Workflow rules | Flow | Best-in-class | None yet |
| Mobile / integrations / maturity | Mature | Mature | Mature | Pre-production |

**Read:** Don't try to match incumbents on breadth/maturity/mobile/integrations. **Win on
fitness-to-CES and AI-native evidence/automation** — incumbents are form-first products retrofitting
AI; this tool's evidence layer + computed values is the ideal substrate for agents that *decide and
execute*, not just summarize.

## Gaps that block the vision (dependency order)

**Tier 1 — foundation:** Entra ID + Graph (auto-routing approvals), Blob + OCR/pHash/EXIF-GPS
(the evidence layer), scheduler (automation heartbeat), notification fabric (visibility loop).
**Tier 2 — field & numbers:** mobile (evidence is born in the field), reporting/xlsx.

## AI-native layers (target)

- **L1 Auto-extraction:** receipt→expense fully populated; email/WhatsApp/voice→record.
- **L2 Ambient copilot:** per-record "Ask AI" (cites derivation); NL command palette.
- **L3 Autonomous agents:** auto-approval of clean expenses; daily-standup agent; anomaly-nudge;
  AI daily brief.
- **L4 Predictive:** margin-erosion forecasting; utilization/conflict prediction; expense-spike
  prediction; employee wellbeing/overwork signals.

## Employee-positive framing (keep balance)

Faster pay (auto-approval + computed DA), no disputes (evidence protects the employee too), less
busywork (snap-a-photo, auto-standups, derived payslips), fairness/transparency (every number shows
its derivation). Lead with these, not surveillance.

→ See `docs/IMPLEMENTATION_ROADMAP.md` for the phased build/deploy plan (P0–P8).
