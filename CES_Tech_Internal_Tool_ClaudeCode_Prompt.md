# Claude Code Build Brief — CES Tech Internal Operations Platform

> **How to use this file:** Paste this whole document into Claude Code as your first
> message, OR drop it into the repo root and tell Claude Code: _"Read this brief fully,
> then follow the 'How You Should Proceed' section."_ Do not start writing code until
> you have read this end to end and confirmed the open decisions in the final section.

---

## 1. Who I am and what my company does (context you do not have)

I am the founder of **CES Tech (legal name: N-Expert Solutions Pvt. Ltd.)**, an
**IT infrastructure services company based in Noida, India**. You have no prior memory
of my business, so everything you need is in this brief.

What we do:

- We **design, build, and operate large enterprise data centers and networks**.
- Core technology areas: **Cisco ACI and Non-ACI data center fabrics, Spine-Leaf
  architecture, SD-WAN, cybersecurity (Palo Alto, Checkpoint, Fortinet), compute,
  and virtualization.**
- OEM partners we work with: **Cisco, Arista, Palo Alto, Checkpoint, Fortinet, Juniper,
  HPE Aruba.**
- Our customers are mostly **large System Integrators (SIs)** — NTT, Airtel Business,
  Arsenal, LTIMindtree — and sometimes **OEMs directly** (e.g. Cisco). The SI/OEM sells
  to an **end customer** (banks, airports, government, energy, aviation).
- **We are a services provider.** We very often deliver under **white-label** mode (our
  identity is hidden and the SI's branding is used), and occasionally the customer exposes
  our identity. The tool must understand a project can have **three parties: CES Tech →
  SI/OEM (our client) → End Customer.**

How we deliver projects (this drives the whole tool):

- Projects are **implementation engagements** (data center build, SD-WAN rollout, security
  deployment, audits, managed services / NOC-SOC).
- Many are **multi-site rollouts** — a single project can span anywhere from 1 site to
  1,400+ branches across India.
- Our **engineers travel on-site** to execute work. Travel is either **inter-city**
  (another city, often overnight, multi-day) or **intra-city** (within the same city,
  same day, local conveyance only).
- We run on the **Microsoft ecosystem** (Word, Excel, PowerPoint, Outlook, Teams,
  **Azure AD / Entra ID**). All user identities live in **Azure AD**.

---

## 2. What I want you to build

A single **internal operations platform** for CES Tech with a **web application** (for
admin, project managers, finance, leadership) and a **mobile app** (for field engineers
and approving managers). It must cover:

1. **Project & Task Management** — project plans, tasks assigned per engineer, mirroring
   how we build project plans (phases → tasks → dependencies → milestones).
2. **Employee Attendance Management** — daily attendance, including on-site / office /
   WFH / travel status, with geofenced check-in from mobile.
3. **Travel Management** — travel requests, approvals, trip tracking, travel cost capture,
   and **grade-based TA/DA limits** with a **mobile app to monitor who is travelling,
   where, and at what cost.**
4. **Expense Management** — engineers log expenses (with receipt photos) against a project
   and/or a trip.
5. **Reimbursement Management** — approved expenses flow to a reimbursement/payout queue.
6. **Daily Allowance (DA / per diem)** — auto-calculated based on **employee grade × city
   tier × number of days on-site.**
7. **Change Management** — (a) a configurable **multi-level approval engine** for travel,
   expenses, reimbursements, attendance regularization, AND (b) **project Change Requests
   (CRs)** that modify project scope / timeline / cost and feed back into the P&L.
8. **Project P&L** — at any point, and especially at project close, I must see **how
   profitable each project is**: Revenue − all costs (engineer effort cost + travel + DA +
   lodging + expenses + other direct costs) = Gross Profit and Margin %.
9. **Azure AD SSO and user sync** — all users come from our Azure AD. **No separate
   login or separate user IDs.** Sign in with Microsoft.
10. **Automation throughout** — auto DA calculation, auto approval routing by hierarchy and
    amount thresholds, auto P&L roll-up, notifications, etc.

---

## 3. Domain glossary (so you interpret requirements correctly)

- **SI** = System Integrator (our client, e.g. NTT, Airtel). **OEM** = hardware/software
  vendor (Cisco, Fortinet). **End customer** = the bank/airport/govt who ultimately uses it.
- **White-label** = we deliver invisibly under the SI's brand. **Branded** = our identity
  is shown. A project carries a flag for this.
- **ACI / Non-ACI / SD-WAN / Spine-Leaf / NOC / SOC** = types of network/DC work; treat as
  selectable **project categories**, not things you need to implement technically.
- **T&M** = Time & Material billing. **Fixed Price** = fixed contract value.
  **Milestone billing** = revenue recognized as milestones are signed off.
- **TA** = Travel Allowance (entitlement for mode/class of travel + local conveyance).
  **DA / Per Diem** = Daily Allowance for being away on-site (food/incidentals).
- **Grade** = employee seniority band (e.g. L1 Junior Engineer … L5 Manager). Grades drive
  TA/DA limits, travel class, and lodging caps.
- **City tier** = classification of destination city (Metro/Tier-1, Tier-2, Tier-3,
  International) that, together with grade, sets DA and lodging limits.
- **Cost rate vs Bill rate** = internal cost of an engineer's day (for P&L) vs what we bill
  the client. P&L uses **cost rate**; revenue comes from the contract.

---

## 4. Key business rules (implement as CONFIGURABLE master data — do NOT hardcode amounts)

I will give you the actual numbers later. Build the **structure** so I (Admin) can set and
edit all of these in the app without code changes.

### 4.1 Employee grades & entitlements

- A **Grades** master: grade code, name, seniority order.
- An **Entitlement matrix** keyed by **(Grade × City Tier)** that defines:
  - **DA / per-diem amount per day** (INR).
  - **Lodging / hotel cap per night** (INR).
  - **Travel mode/class entitlement** (e.g. flight economy / train AC 2-tier / etc.).
  - **Local conveyance cap per day** (for intra-city / on-site local travel).
- A **City master** with each city mapped to a **City Tier**, so DA auto-resolves from the
  destination. International handled as its own tier (currency note below).

### 4.2 DA auto-calculation

- When a trip is approved/closed, DA = `per-diem(grade, city tier) × eligible days`.
- Half-day / departure-day / return-day rules must be configurable (e.g. first and last day
  at X% of per diem) — make the policy editable, not fixed in code.
- Intra-city same-day work = no overnight DA, only local conveyance allowance (configurable).

### 4.3 Approval / change management engine (generic, reusable)

- A **configurable workflow engine** that routes any approvable item (travel request,
  expense claim, reimbursement, attendance regularization, project CR) through one or more
  approval steps.
- Routing rules driven by: **reporting manager (from Azure AD), amount thresholds, project
  role, and grade.** Example pattern: < ₹X → manager only; ≥ ₹X → manager + finance;
  ≥ ₹Y → manager + finance + director. Thresholds editable in admin.
- Every item has a full **audit trail** (who, what, when, comment) and statuses:
  Draft → Submitted → Pending Approval(s) → Approved/Rejected → Settled/Closed.

### 4.4 Project P&L logic

- **Revenue** per project: contract value, supporting **Fixed Price, T&M, and
  Milestone** models (milestones each have a value and a signed-off date).
- **Costs** rolled up automatically from:
  - **Effort cost** = logged engineer time (days/hours per task) × that engineer's
    grade **cost rate**.
  - **Travel cost** (actual fares/conveyance), **DA cost**, **lodging cost**,
    **other reimbursed expenses**, and any **other direct project costs** (entered manually).
  - Optional flag for **hardware/OEM pass-through** cost if I choose to include it
    (see open decision in §10).
- **Outputs:** Planned vs Actual cost, **Gross Profit = Revenue − Total Cost**,
  **Margin %**, burn rate, and a forecast-to-complete. Show **per project** and an
  **all-projects portfolio dashboard.**

---

## 5. Module-by-module functional requirements

### 5.1 Project & Task Management

- Create a project with: name, **SI/OEM client, end customer, white-label flag**, project
  category (ACI / Non-ACI / SD-WAN / Security / Audit / Managed Services), billing model,
  contract value, planned start/end, project manager, and a **list of sites** (a project
  can have many sites/locations).
- **Project plan:** phases → tasks → sub-tasks, with planned/actual start & end,
  dependencies, % complete, milestones, and **task assignment to a specific engineer.**
- Engineers see their assigned tasks and **log effort (time) and status** against them
  (effort feeds P&L).
- Gantt-style view on web; task list + status update on mobile.
- **Excel import/export** of project plans (we currently build plans in Excel — support a
  clean import so I can bring existing plans in, and export back to .xlsx).

### 5.2 Attendance

- Daily attendance per employee: check-in / check-out, with **status type**
  (Office / WFH / On-site / Travel / Leave).
- **Mobile geofenced check-in** when on a project site; record location & timestamp.
- Attendance regularization request → goes through the approval engine.
- Monthly attendance summary export (.xlsx) for payroll hand-off.

### 5.3 Travel Management (web + mobile)

- **Travel request:** project, from/to city, dates, mode, purpose, inter-city vs intra-city.
  On submit, the system **shows the applicable TA/DA entitlement** for that engineer's grade
  and the destination tier, then routes for approval.
- After approval, engineer travels; **mobile app logs the trip** (start/end, optional GPS
  trail), and lets them capture actual travel cost + receipts.
- **DA auto-computed** on trip closure per §4.2.
- **Monitoring dashboards (the part I especially want):** who is travelling now, where,
  trip cost, total travel spend by project / by engineer / by month, and travel cost vs
  budget. This is a key leadership view.

### 5.4 Expense & Reimbursement

- Expense entry: category, amount, date, **project allocation**, optional **trip link**,
  **receipt image upload**, notes.
- Validation against entitlement caps (warn/block if over policy — configurable).
- Approved expenses → **reimbursement queue** with payout status (Pending → Approved →
  Paid), batch export for finance, and reference number tracking.

### 5.5 Change Management

- **Approval engine** as defined in §4.3 (used by all modules above).
- **Project Change Requests:** raise a CR against a live project that changes scope,
  timeline, or commercials; on approval it updates the project's planned values and is
  reflected in the P&L (baseline vs current).

### 5.6 Dashboards & Reporting

- Leadership dashboard: portfolio P&L, margin by project, travel spend, utilization,
  attendance.
- PM dashboard: my projects' plan vs actual, task status, open approvals.
- Finance dashboard: pending reimbursements, expense trends, DA payouts.
- **All reports exportable to Excel (.xlsx)** — we live in the Microsoft ecosystem.

---

## 6. Azure AD / Entra ID requirements (non-negotiable)

- **Single Sign-On with Microsoft (OIDC/OAuth2 via MSAL).** No local username/password.
- **User provisioning/sync from Azure AD via Microsoft Graph** — pull users, their email,
  display name, department, **job title, and manager relationship** (the manager link
  powers approval routing). Support periodic sync and/or login-time provisioning.
- Map an internal **Grade** to each user (Grade may not exist in Azure AD — allow Admin to
  set it in-app, or map from an AD attribute/extension if available).
- **Role-Based Access Control** roles inside the app: **Admin, Finance, Project Manager,
  Reporting Manager/Approver, Engineer** (a user can hold more than one). RBAC governs what
  each role sees and can approve.
- Use Microsoft Graph for **email notifications** (Outlook) where practical; consider
  Teams notifications later.

---

## 7. Mobile app requirements

- Cross-platform (iOS + Android), Microsoft sign-in (MSAL).
- Engineer features: view & update assigned tasks, log effort, geofenced attendance
  check-in/out, raise & track travel requests, **log trips (with optional GPS) and capture
  travel cost**, snap receipts and submit expenses, view DA owed.
- Manager features: **approve/reject on mobile** (travel, expense, reimbursement,
  attendance) with the approval engine.
- Offline-tolerant capture (queue receipts/expenses when offline, sync when back online) —
  field sites often have poor connectivity.

---

## 8. Recommended technical approach (confirm with me in §10 before building)

You may propose better, but here is my preferred direction given we are Azure/Microsoft-centric:

- **Monorepo** (e.g. Turborepo or Nx) with shared TypeScript packages for web + mobile +
  backend, so types and business logic (DA calc, P&L) are shared and tested once.
- **Backend:** Node.js + **NestJS (TypeScript)** REST API. (If you think **.NET** is a
  better fit for tight Azure/Graph integration, raise it — I'm open.)
- **Web:** **Next.js + React + TypeScript**, Tailwind, a clean component library.
- **Mobile:** **React Native (Expo)** to share TypeScript logic with web. (Flutter is the
  alternative — flag a recommendation.)
- **Database:** **PostgreSQL** (Azure Database for PostgreSQL) with a migration tool
  (e.g. Prisma or TypeORM). Azure SQL is acceptable if you argue for it.
- **Auth:** Azure AD / Entra ID via MSAL + OIDC; **Microsoft Graph** for user sync & mail.
- **File storage:** Azure Blob Storage for receipts/attachments.
- **Hosting:** Azure App Service or Azure Container Apps; configuration via environment
  variables / Azure Key Vault. **Data residency: India region.**
- **Cross-cutting:** RBAC, full audit logging, soft-deletes, multi-currency-ready (INR
  default; international DA may be in foreign currency), Excel import/export utilities,
  automated tests for the **DA and P&L calculation engines** (these are the financially
  sensitive parts — they must be correct and covered by unit tests).

---

## 9. Suggested data model (starting point — refine it)

Core entities (not exhaustive):

- **User** (azure_oid, name, email, department, job_title, manager_id, grade_id, roles[],
  cost_rate, active)
- **Grade** (code, name, seniority_order) and **CostRate** (grade_id, cost_rate, effective_from)
- **City** (name, tier) and **EntitlementMatrix** (grade_id, city_tier, per_diem,
  lodging_cap, travel_class, local_conveyance_cap, effective_from)
- **Client** (SI/OEM) and **EndCustomer**
- **Project** (name, client_id, end_customer_id, white_label, category, billing_model,
  contract_value, pm_id, planned_start, planned_end, status) + **ProjectSite** (project_id,
  site_name, city_id, address)
- **Milestone** (project_id, name, value, planned_date, signed_off_date)
- **Phase / Task** (project_id, parent_id, assignee_id, planned/actual dates, status,
  %complete, dependencies) + **TimeLog** (task_id, user_id, date, hours)
- **Attendance** (user_id, date, type, check_in, check_out, geo_lat/lng, status)
- **TravelRequest** (user_id, project_id, from_city, to_city, dates, mode, trip_type,
  status) + **Trip** (travel_request_id, actuals, gps_trail?, da_days, da_amount)
- **Expense** (user_id, project_id, trip_id?, category, amount, currency, date, receipt_url,
  status) + **Reimbursement** (expense_ids[], payout_status, paid_on, reference)
- **ChangeRequest** (project_id, type, description, scope/time/cost deltas, status)
- **ApprovalWorkflow / ApprovalStep / ApprovalInstance** (generic engine + audit)
- **ProjectFinancials** (computed/rolled-up view: revenue, planned_cost, actual_cost by
  category, gross_profit, margin)
- **AuditLog** (entity, action, actor, before/after, timestamp)

---

## 10. How you should proceed (working method — follow this order)

This is a **large, multi-session build.** Do **not** try to one-shot it. Work like this:

1. **Read this entire brief.** Then ask me the **open decisions** below in one batch before
   writing any code. Do not assume — confirm.
2. **Propose the final architecture & stack** (with reasoning where you differ from §8) and
   a **phased delivery plan with an MVP first.** Wait for my sign-off.
3. **Create a `CLAUDE.md`** in the repo root capturing: this business context, the domain
   glossary, the data model, coding conventions, branding note, and the calculation rules —
   so future sessions stay consistent.
4. **Scaffold the monorepo** (web, mobile, backend, shared) with linting, formatting, env
   config, and a working CI-style test command.
5. **Build the foundation first, in this order:**
   (a) Azure AD SSO + Graph user sync + RBAC, (b) Master data (grades, cost rates, cities,
   tiers, entitlement matrix, clients, customers), (c) the **DA calculation engine** and
   **P&L engine** as well-tested shared modules.
6. **Then build modules incrementally**, each shippable and testable on its own, in roughly
   this order: Projects & Tasks → Attendance → Travel → Expense/Reimbursement → Approval/
   Change Management → Dashboards/Reporting → Mobile app.
7. After each module, **summarize what you built, how to run/test it, and what's next**, and
   pause for my feedback. Keep changes reviewable — small, logical commits with messages.
8. Use **seed/sample data** so I can click through features immediately. Write **unit tests
   for DA and P&L** specifically.
9. When something is ambiguous mid-build, **ask rather than guess.**

### Open decisions — ask me these before coding

1. **Cloud:** Confirm Azure (my preference) — or do you recommend otherwise?
2. **Backend:** NestJS (TypeScript) vs **.NET** for tighter Graph/Azure integration?
3. **Mobile:** React Native (Expo) vs Flutter — your recommendation?
4. **Database:** PostgreSQL vs Azure SQL?
5. **P&L scope:** Services-only (effort + travel + DA + expenses), or also include
   **hardware/OEM pass-through** revenue & cost?
6. **Integrations now or later:** Should we plan hooks for **payroll, accounting
   (e.g. Tally/SAP), and Teams notifications**, or keep v1 standalone with Excel export?
7. **MVP cut:** Which 2–3 modules do I want working end-to-end first? (Suggest a sensible
   MVP and let me confirm.)

---

## 11. Constraints & preferences to remember throughout

- We are a **Microsoft-ecosystem** company: all exports in **Excel (.xlsx)**, integrate
  with **Outlook/Teams/Azure AD**, no Google Workspace dependencies.
- **All amounts in INR by default**; support a foreign-currency path for international DA.
- **Nothing financial should be hardcoded** — grades, rates, per-diems, caps, thresholds are
  all admin-editable master data.
- **Correctness of DA and P&L is critical** — these decide real money and real margin.
- This is an **internal tool** (not client-facing), so it does not need CES Tech client
  branding; keep the UI clean, fast, and practical for daily field use.
