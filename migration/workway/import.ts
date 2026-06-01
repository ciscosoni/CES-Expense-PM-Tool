/**
 * Workway → CES tool importer (phase 3).
 *
 * Reads migration/workway/_discovery/full/*.json and loads it into the local dev
 * DB, applying the agreed rules:
 *   - Orphans (no project / deleted task)  → a synthetic "Workway import" fallback
 *     client/project/task so nothing is lost.
 *   - Project PM → Workway creator (added_by), else the super-admin.
 *   - Grades    → designation mapped to L1–L5 (approximate).
 *
 * Dry-run by default (writes nothing, prints a full report). Pass --commit to write.
 * Idempotent: every row is tagged in AuditLog with its Workway id; a re-run skips
 * ids already imported.
 *
 * Run:  cd apps/api && pnpm exec tsx ../../migration/workway/import.ts [--commit]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';

const COMMIT = process.argv.includes('--commit');
const FULL = join(__dirname, '_discovery', 'full');
const SUPER_ADMIN_EMAIL = process.env.WORKWAY_SUPERADMIN_EMAIL || 'admin@cestech.in';

// DATABASE_URL from the repo root .env (tsx doesn't auto-load it).
function dbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(__dirname, '..', '..', '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('DATABASE_URL not found');
  return m[1].trim().replace(/^["']|["']$/g, '');
}
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } });

const load = (n: string): any[] => {
  const d = JSON.parse(readFileSync(join(FULL, `${n}.json`), 'utf8'));
  return Array.isArray(d) ? d : d.data ?? [];
};

// ---------- parsing helpers ----------
const ht = (v: unknown): string => String(v ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
function parseDate(s: unknown): Date | null {
  const t = ht(s).split(' ')[0];
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/); // YYYY-MM-DD
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/); // DD-MM-YYYY
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}
function parseHours(tl: any): number {
  let v = 0;
  const timer = ht(tl.timer); // HH:MM:SS
  const m = timer.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (m) v = +m[1] + +m[2] / 60 + +m[3] / 3600;
  else {
    const h = ht(tl.hours).match(/(\d+)\s*h/);
    const mi = ht(tl.hours).match(/(\d+)\s*m/);
    v = (h ? +h[1] : 0) + (mi ? +mi[1] : 0) / 60;
  }
  // hours is Decimal(5,2) → cap at 999.99 (runaway/active timers).
  return Math.min(999.99, Math.max(0, Math.round(v * 100) / 100));
}
const cleanName = (s: unknown): string => ht(s).replace(/^(Mr|Ms|Mrs|Dr)\s+/i, '').trim();

// ---------- enum / mapping rules ----------
function mapRoles(roles: any[]): string[] {
  const names = (roles ?? []).map((r) => String(r.name ?? r).toLowerCase());
  const out = new Set<string>();
  for (const r of names) {
    if (r.includes('admin') || r.includes('cto') || r.includes('chief')) out.add('ADMIN');
    else if (r.includes('finance')) out.add('FINANCE');
    else if (r.includes('project-manager') || r === 'pm') out.add('PROJECT_MANAGER');
  }
  out.add('ENGINEER'); // everyone is at least an engineer
  return [...out];
}
function mapGrade(designation: string): string {
  const d = designation.toLowerCase();
  if (/intern|trainee|office boy|driver|associate|fresher/.test(d)) return 'L1';
  if (/(senior|lead|architect|coordinator|cordinator|specialist|sr\.?)\b/.test(d)) return 'L3';
  if (/director|cto|ceo|cfo|coo|founder|general manager|gm\b|head|vp|president/.test(d)) return 'L5';
  if (/manager|assitant general|assistant general|agm/.test(d)) return 'L4';
  if (/engineer|recruiter|developer|trainer|analyst|consultant/.test(d)) return 'L2';
  return 'L2';
}
const mapProjectStatus = (s: string): string =>
  /finish|complete|closed/i.test(s) ? 'CLOSED' : /not started|draft/i.test(s) ? 'DRAFT' : 'ACTIVE';
function mapProjectCategory(name: string, cat: string): string {
  const s = `${name} ${cat}`.toLowerCase();
  if (/sd-?wan/.test(s)) return 'SD_WAN';
  if (/\baci\b/.test(s)) return 'ACI';
  if (/secur|firewall|soc\b/.test(s)) return 'SECURITY';
  if (/audit/.test(s)) return 'AUDIT';
  if (/noc|managed|support/.test(s)) return 'MANAGED_SERVICES';
  return 'NON_ACI';
}
const mapTaskStatus = (s: string, col: string): Prisma.TaskCreateInput['status'] => {
  const x = `${s} ${col}`.toLowerCase();
  if (/complete|done/.test(x)) return 'DONE';
  if (/in progress|in_progress/.test(x)) return 'IN_PROGRESS';
  if (/review|blocked|hold/.test(x)) return 'BLOCKED';
  return 'TODO';
};
const mapExpenseStatus = (s: string): string =>
  /approv/i.test(s) ? 'APPROVED' : /reject/i.test(s) ? 'REJECTED' : 'SUBMITTED';
function mapExpenseCategory(item: string): string {
  const s = item.toLowerCase();
  if (/travel|flight|train|air|cab|taxi|uber|ola|fuel|petrol|toll|bind/.test(s)) return 'TRAVEL';
  if (/hotel|lodg|stay|room|accommod/.test(s)) return 'LODGING';
  if (/food|meal|lunch|dinner|restaurant/.test(s)) return 'MEALS';
  if (/auto|conveyance|local/.test(s)) return 'LOCAL_CONVEYANCE';
  if (/phone|mobile|internet|data|sim|recharge/.test(s)) return 'COMMUNICATION';
  if (/material|hardware|cable|equipment|tool/.test(s)) return 'MATERIALS';
  return 'OTHER';
}

// ---------- report ----------
const report: Record<string, { created: number; skipped: number; fallback: number; warnings: string[] }> = {};
const tick = (e: string, k: 'created' | 'skipped' | 'fallback', warn?: string) => {
  report[e] ??= { created: 0, skipped: 0, fallback: 0, warnings: [] };
  report[e][k]++;
  if (warn && report[e].warnings.length < 5) report[e].warnings.push(warn);
};

async function alreadyImported(entity: string): Promise<Set<string>> {
  const rows = await prisma.auditLog.findMany({
    where: { entity, action: 'WORKWAY_IMPORT' },
    select: { after: true },
  });
  return new Set(rows.map((r) => String((r.after as any)?.wwId)).filter(Boolean));
}
async function audit(entity: string, entityId: string, wwId: string | number, extra?: any) {
  if (!COMMIT) return;
  await prisma.auditLog.create({
    data: { entity, entityId, action: 'WORKWAY_IMPORT', after: { wwId: String(wwId), ...extra } },
  });
}

async function main() {
  console.log(`\n=== Workway import — ${COMMIT ? 'COMMIT (writing)' : 'DRY RUN (no writes)'} ===\n`);

  const superAdmin = await prisma.user.findFirst({ where: { email: SUPER_ADMIN_EMAIL } });
  if (!superAdmin) throw new Error(`Super-admin ${SUPER_ADMIN_EMAIL} not found — seed the DB first.`);
  const grades = new Map((await prisma.grade.findMany()).map((g) => [g.code, g.id]));

  // ---- 1. USERS (employees + any author embedded in expenses/timelogs) ----
  const employees = load('employees');
  const expenses = load('expenses');
  const timelogs = load('timelogs');
  // Collect everyone we'll need a user for, keyed by email.
  type WUser = { wwId: string; email: string; name: string; designation?: string; dept?: string; reportingTo?: string; roles?: any[]; active?: boolean };
  const byEmail = new Map<string, WUser>();
  for (const e of employees) {
    const email = String(e.email ?? '').toLowerCase();
    if (!email) continue;
    byEmail.set(email, {
      wwId: String(e.id), email, name: cleanName(e.employee_name || e.name_salutation),
      designation: ht(e.designation_name), dept: ht(e.department_name),
      reportingTo: ht(e.reporting_to), roles: e.roles, active: /active/i.test(ht(e.status)),
    });
  }
  for (const src of [expenses, timelogs]) {
    for (const row of src) {
      const u = row.user;
      if (!u?.email) continue;
      const email = String(u.email).toLowerCase();
      if (!byEmail.has(email)) {
        byEmail.set(email, { wwId: String(u.id), email, name: cleanName(u.name_salutation || u.name), active: false });
      }
    }
  }
  const doneUsers = await alreadyImported('User');
  const emailToUserId = new Map<string, string>(); // email -> our user id
  const wwUserToEmail = new Map<string, string>(); // workway user id -> email
  const nameToUserId = new Map<string, string>();
  for (const u of byEmail.values()) {
    wwUserToEmail.set(u.wwId, u.email);
    const existing = await prisma.user.findFirst({ where: { email: u.email }, select: { id: true } });
    if (existing) {
      emailToUserId.set(u.email, existing.id);
      nameToUserId.set(u.name.toLowerCase(), existing.id);
      tick('User', 'skipped');
      continue;
    }
    if (doneUsers.has(u.wwId)) { tick('User', 'skipped'); continue; }
    const gradeCode = u.designation ? mapGrade(u.designation) : 'L2';
    const data: Prisma.UserCreateInput = {
      azureOid: `pending:${u.email}`, email: u.email, displayName: u.name || u.email,
      roles: mapRoles(u.roles ?? []) as any, jobTitle: u.designation || null, department: u.dept || null,
      active: u.active ?? false, grade: grades.has(gradeCode) ? { connect: { id: grades.get(gradeCode)! } } : undefined,
    };
    if (COMMIT) {
      const created = await prisma.user.create({ data });
      emailToUserId.set(u.email, created.id);
      nameToUserId.set(u.name.toLowerCase(), created.id);
      await audit('User', created.id, u.wwId, { email: u.email, grade: gradeCode });
    } else {
      emailToUserId.set(u.email, `dry:${u.email}`);
      nameToUserId.set(u.name.toLowerCase(), `dry:${u.email}`);
    }
    tick('User', 'created');
  }
  // Manager chain (by reporting_to name).
  if (COMMIT) {
    for (const u of byEmail.values()) {
      if (!u.reportingTo) continue;
      const mgr = nameToUserId.get(u.reportingTo.toLowerCase());
      const me = emailToUserId.get(u.email);
      if (mgr && me && mgr !== me && !mgr.startsWith('dry')) {
        await prisma.user.update({ where: { id: me }, data: { managerId: mgr } }).catch(() => {});
      }
    }
  }

  // ---- 2. CLIENTS ----
  const clients = load('clients');
  const clientNameToId = new Map<string, string>();
  for (const c of clients) {
    const name = cleanName(c.client_name) || ht(c.name_salutation);
    if (!name) { tick('Client', 'skipped'); continue; }
    const existing = await prisma.client.findFirst({ where: { name } });
    if (existing) { clientNameToId.set(name.toLowerCase(), existing.id); tick('Client', 'skipped'); continue; }
    if (COMMIT) {
      const created = await prisma.client.create({ data: { name, kind: 'SI' } });
      clientNameToId.set(name.toLowerCase(), created.id);
      await audit('Client', created.id, c.id);
    } else clientNameToId.set(name.toLowerCase(), `dry:${name}`);
    tick('Client', 'created');
  }
  // Fallback client for orphans (upsert — survives re-runs).
  let fallbackClientId: string;
  if (COMMIT) {
    const fc = await prisma.client.upsert({
      where: { name: 'Workway Import (unassigned)' },
      update: {},
      create: { name: 'Workway Import (unassigned)', kind: 'SI' },
    });
    fallbackClientId = fc.id;
  } else fallbackClientId = 'dry:fallback-client';

  // ---- 3. PROJECTS ----
  const projects = load('projects');
  const wwProjectToId = new Map<string, string>(); // workway project id -> our project id
  for (const p of projects) {
    const code = ht(p.project_short_code) || `WW-${p.id}`;
    const name = ht(p.project) || code;
    const existing = await prisma.project.findFirst({ where: { code }, select: { id: true } });
    if (existing) { wwProjectToId.set(String(p.id), existing.id); tick('Project', 'skipped'); continue; }
    const clientName = cleanName(p.client_name).toLowerCase();
    const clientId = clientNameToId.get(clientName) ?? fallbackClientId;
    const pmId = (p.added_by && wwUserToEmail.get(String(p.added_by)) && emailToUserId.get(wwUserToEmail.get(String(p.added_by))!)) || superAdmin.id;
    const budget = p.project_budget ? String(p.project_budget) : null;
    // plannedStart/plannedEnd are required; default when Workway has no dates.
    const pStart = parseDate(p.start_date) ?? new Date();
    const pEnd = parseDate(p.deadline) ?? new Date(pStart.getTime() + 90 * 86_400_000);
    const data: Prisma.ProjectCreateInput = {
      code, name, client: { connect: { id: clientId } },
      category: mapProjectCategory(name, ht((p.category ?? {}).category_name)) as any,
      billingModel: 'T_AND_M', contractValue: budget ?? '0', contractCurrency: 'INR',
      pm: { connect: { id: pmId } }, status: mapProjectStatus(ht(p.project_status)) as any,
      plannedStart: pStart, plannedEnd: pEnd,
      budget: budget, budgetCurrency: budget ? 'INR' : null,
    };
    if (COMMIT && !pmId.startsWith('dry') && !clientId.startsWith('dry')) {
      const created = await prisma.project.create({ data });
      wwProjectToId.set(String(p.id), created.id);
      await audit('Project', created.id, p.id, { code });
    } else wwProjectToId.set(String(p.id), `dry:${code}`);
    tick('Project', 'created');
  }
  // Fallback project for orphan tasks/expenses/timelogs.
  let fallbackProjectId = wwProjectToId.get('__fallback__');
  if (COMMIT) {
    const fp = await prisma.project.upsert({
      where: { code: 'WW-UNASSIGNED' },
      update: {},
      create: {
        code: 'WW-UNASSIGNED', name: 'Unassigned (Workway import)', client: { connect: { id: fallbackClientId } },
        category: 'NON_ACI', billingModel: 'T_AND_M', contractValue: '0', contractCurrency: 'INR',
        pm: { connect: { id: superAdmin.id } }, status: 'ACTIVE',
        plannedStart: new Date(), plannedEnd: new Date(Date.now() + 365 * 86_400_000),
      },
    });
    fallbackProjectId = fp.id;
  } else fallbackProjectId = 'dry:fallback-project';

  // ---- 4. TASKS ----
  const tasks = load('tasks');
  const wwTaskToId = new Map<string, string>();
  const doneTasks = await alreadyImported('Task');
  for (const t of tasks) {
    if (doneTasks.has(String(t.id))) { tick('Task', 'skipped'); continue; }
    const wwProj = String((t.project ?? {}).id ?? '');
    let projectId = wwProjectToId.get(wwProj);
    if (!projectId) { projectId = fallbackProjectId; tick('Task', 'fallback'); }
    const assigneeWw = String((t.task_users ?? [])[0]?.user_id ?? '');
    const assigneeEmail = wwUserToEmail.get(assigneeWw);
    const assigneeId = assigneeEmail ? emailToUserId.get(assigneeEmail) : undefined;
    const data: Prisma.TaskCreateInput = {
      project: { connect: { id: projectId } }, name: ht(t.heading).slice(0, 250) || `Task ${t.id}`,
      status: mapTaskStatus(ht(t.status), ht(t.board_column)),
      plannedStart: parseDate(t.start_date), plannedEnd: parseDate(t.due_date),
      ...(assigneeId && !assigneeId.startsWith('dry') ? { assignee: { connect: { id: assigneeId } } } : {}),
    };
    if (COMMIT && !projectId.startsWith('dry')) {
      const created = await prisma.task.create({ data });
      wwTaskToId.set(String(t.id), created.id);
      await audit('Task', created.id, t.id);
    } else wwTaskToId.set(String(t.id), `dry:${t.id}`);
    tick('Task', 'created');
  }
  // Fallback task for orphan timelogs.
  let fallbackTaskId: string | undefined;
  if (COMMIT) {
    const existingFt = await prisma.task.findFirst({ where: { projectId: fallbackProjectId, name: 'General (Workway import)' } });
    fallbackTaskId = existingFt?.id ?? (await prisma.task.create({
      data: { project: { connect: { id: fallbackProjectId } }, name: 'General (Workway import)', status: 'TODO' },
    })).id;
  } else fallbackTaskId = 'dry:fallback-task';

  // ---- 5. TIMELOGS ----
  const resolveUser = (...wwIds: (string | number | undefined)[]): { id: string; fell: boolean } => {
    for (const w of wwIds) {
      if (w == null) continue;
      const email = wwUserToEmail.get(String(w));
      const id = email && emailToUserId.get(email);
      if (id) return { id, fell: false };
    }
    return { id: superAdmin.id, fell: true }; // lose nothing — attribute to import owner
  };

  const doneTl = await alreadyImported('TimeLog');
  for (const l of timelogs) {
    if (doneTl.has(String(l.id))) { tick('TimeLog', 'skipped'); continue; }
    const { id: userId, fell: userFell } = resolveUser(l.user_id, l.user?.id, l.added_by);
    if (userFell) tick('TimeLog', 'fallback');
    let taskId = wwTaskToId.get(String((l.task ?? {}).id ?? ''));
    if (!taskId) { taskId = fallbackTaskId; tick('TimeLog', 'fallback'); }
    const date = parseDate(l.start_time) ?? new Date();
    const data: Prisma.TimeLogCreateInput = {
      task: { connect: { id: taskId } }, user: { connect: { id: userId } },
      date, hours: String(parseHours(l)), notes: ht(l.memo).slice(0, 200) || null,
    };
    if (COMMIT && !userId.startsWith('dry') && !taskId.startsWith('dry')) {
      const created = await prisma.timeLog.create({ data });
      await audit('TimeLog', created.id, l.id);
    }
    tick('TimeLog', 'created');
  }

  // ---- 6. EXPENSES ----
  const doneEx = await alreadyImported('Expense');
  for (const x of expenses) {
    if (doneEx.has(String(x.id))) { tick('Expense', 'skipped'); continue; }
    let userId = emailToUserId.get(String(x.user?.email ?? '').toLowerCase());
    if (!userId) {
      const r = resolveUser(x.user?.id, x.added_by);
      userId = r.id;
      tick('Expense', 'fallback');
    }
    let projectId = x.project_id ? wwProjectToId.get(String(x.project_id)) : undefined;
    if (!projectId) { projectId = fallbackProjectId; tick('Expense', 'fallback'); }
    const item = ht(x.export_item_name || x.item_name);
    const data: Prisma.ExpenseCreateInput = {
      user: { connect: { id: userId } }, project: { connect: { id: projectId } },
      category: mapExpenseCategory(item) as any, amount: String(x.default_currency_price ?? '0'),
      currency: 'INR', incurredOn: parseDate(x.purchase_date) ?? new Date(),
      status: mapExpenseStatus(ht(x.status_export)) as any, notes: item.slice(0, 200) || null,
    };
    if (COMMIT && !userId.startsWith('dry') && !projectId.startsWith('dry')) {
      const created = await prisma.expense.create({ data });
      await audit('Expense', created.id, x.id);
    }
    tick('Expense', 'created');
  }

  // ---- report ----
  console.log('Entity        created  skipped  fallback');
  for (const [e, r] of Object.entries(report)) {
    console.log(`  ${e.padEnd(12)} ${String(r.created).padStart(6)} ${String(r.skipped).padStart(8)} ${String(r.fallback).padStart(9)}`);
    for (const w of r.warnings) console.log(`        ⚠ ${w}`);
  }
  console.log(`\n${COMMIT ? '✓ Committed.' : 'Dry run only — re-run with --commit to write.'}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Import failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
