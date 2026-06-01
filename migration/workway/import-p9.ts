/**
 * P9 backfill — populate the new P9 models/fields from the Workway data already
 * pulled. Run after import.ts. Idempotent. Backfills:
 *   E (HR): user employmentType/joiningDate/probation/notice
 *   D (tasks): estimateHours / priority / labels / milestone link
 *   F (vendors): Vendor master + Expense.vendorId / isRecurring
 *   C (leave): LeaveType (Paid/Unpaid) + Leave rows; Holiday calendar
 *
 * Run:  cd apps/api && pnpm exec tsx ../../migration/workway/import-p9.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const FULL = join(__dirname, '_discovery', 'full');
const DISC = join(__dirname, '_discovery');
function dbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const m = readFileSync(join(__dirname, '..', '..', '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
  return m![1].trim().replace(/^["']|["']$/g, '');
}
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } });
const load = (n: string): any[] => {
  const f = join(FULL, `${n}.json`);
  if (!existsSync(f)) return [];
  const d = JSON.parse(readFileSync(f, 'utf8'));
  return Array.isArray(d) ? d : d.data ?? [];
};
const ht = (v: unknown) => String(v ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
function parseDate(s: unknown): Date | null {
  const t = ht(s).split(' ')[0];
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}

async function main() {
  console.log('\n=== P9 backfill ===\n');

  // wwUserId → our user id (via employees email)
  const employees = load('employees');
  const emailToId = new Map<string, string>();
  for (const u of await prisma.user.findMany({ select: { id: true, email: true } })) {
    emailToId.set(u.email.toLowerCase(), u.id);
  }
  const wwUserToOur = new Map<string, string>();
  for (const e of employees) {
    const id = emailToId.get(String(e.email ?? '').toLowerCase());
    if (id) wwUserToOur.set(String(e.id), id);
  }

  // ---- E: HR lifecycle ----
  const ET: Record<string, any> = { 'new hire': 'FULL_TIME', 'full time': 'FULL_TIME', permanent: 'FULL_TIME', intern: 'INTERN', internship: 'INTERN', contract: 'CONTRACT', contractual: 'CONTRACT', consultant: 'CONSULTANT', 'part time': 'PART_TIME' };
  let hr = 0;
  for (const e of employees) {
    const ourId = wwUserToOur.get(String(e.id));
    if (!ourId) continue;
    const det = e.employee_detail ?? {};
    const etRaw = ht(e.employment_type || det.employment_type).toLowerCase();
    await prisma.user.update({
      where: { id: ourId },
      data: {
        employmentType: ET[etRaw] ?? null,
        joiningDate: parseDate(e.joining_date || det.joining_date),
        probationEndDate: parseDate(det.probation_end_date),
        noticePeriodEndDate: parseDate(det.notice_period_end_date),
      },
    });
    hr++;
  }
  console.log(`E (HR): updated ${hr} users`);

  // ---- D: task estimate / priority / labels ----
  const tasks = load('tasks');
  const taskAudit = await prisma.auditLog.findMany({ where: { entity: 'Task', action: 'WORKWAY_IMPORT' }, select: { entityId: true, after: true } });
  const wwTaskToOur = new Map<string, string>();
  for (const a of taskAudit) wwTaskToOur.set(String((a.after as any)?.wwId), a.entityId);
  const PRIO: Record<string, any> = { high: 'HIGH', urgent: 'URGENT', medium: 'MEDIUM', low: 'LOW' };
  let td = 0;
  for (const t of tasks) {
    const ourId = wwTaskToOur.get(String(t.id));
    if (!ourId) continue;
    const est = (Number(t.estimate_hours) || 0) + (Number(t.estimate_minutes) || 0) / 60;
    const labels = (Array.isArray(t.labels) ? t.labels : [])
      .map((l: any) => ht(l?.label_name ?? l?.name ?? l))
      .filter(Boolean)
      .slice(0, 10);
    await prisma.task.update({
      where: { id: ourId },
      data: {
        estimateHours: est > 0 ? String(Math.round(est * 100) / 100) : null,
        priority: PRIO[ht(t.priority).toLowerCase()] ?? 'MEDIUM',
        labels,
      },
    });
    td++;
  }
  console.log(`D (tasks): updated ${td} tasks`);

  // ---- F: vendors + expense vendor/recurring ----
  const expenses = load('expenses');
  const vendorNames = new Set<string>();
  for (const x of expenses) {
    const v = ht(x.purchase_from);
    if (v && v !== '--' && v.length > 1) vendorNames.add(v);
  }
  const vendorIdByName = new Map<string, string>();
  for (const name of vendorNames) {
    const v = await prisma.vendor.upsert({ where: { name }, update: {}, create: { name } });
    vendorIdByName.set(name.toLowerCase(), v.id);
  }
  const expAudit = await prisma.auditLog.findMany({ where: { entity: 'Expense', action: 'WORKWAY_IMPORT' }, select: { entityId: true, after: true } });
  const wwExpToOur = new Map<string, string>();
  for (const a of expAudit) wwExpToOur.set(String((a.after as any)?.wwId), a.entityId);
  let ef = 0;
  for (const x of expenses) {
    const ourId = wwExpToOur.get(String(x.id));
    if (!ourId) continue;
    const vId = vendorIdByName.get(ht(x.purchase_from).toLowerCase());
    await prisma.expense.update({
      where: { id: ourId },
      data: { vendorId: vId ?? null, isRecurring: !!x.expenses_recurring_id },
    });
    ef++;
  }
  console.log(`F (vendors): ${vendorIdByName.size} vendors, ${ef} expenses linked`);

  // ---- C: leave types + leaves + holidays ----
  const paidType = await prisma.leaveType.upsert({ where: { name: 'Paid' }, update: {}, create: { name: 'Paid', paid: true } });
  const unpaidType = await prisma.leaveType.upsert({ where: { name: 'Unpaid' }, update: {}, create: { name: 'Unpaid', paid: false } });
  const leaves = load('leaves');
  const doneLeaves = new Set(
    (await prisma.auditLog.findMany({ where: { entity: 'Leave', action: 'WORKWAY_IMPORT' }, select: { after: true } })).map((r) => String((r.after as any)?.wwId)),
  );
  let lc = 0;
  for (const l of leaves) {
    if (doneLeaves.has(String(l.id))) continue;
    const ourUser = wwUserToOur.get(String(l.user_id));
    const date = parseDate(l.leave_date);
    if (!ourUser || !date) continue;
    const st = ht(l.status).toLowerCase();
    const created = await prisma.leave.create({
      data: {
        userId: ourUser,
        leaveTypeId: String(l.paid) === '1' || l.paid === true ? paidType.id : unpaidType.id,
        date,
        durationDays: /half|0.5/i.test(ht(l.duration)) ? '0.5' : '1',
        status: st.includes('approv') ? 'APPROVED' : st.includes('reject') ? 'REJECTED' : 'PENDING',
        reason: ht(l.reason) || null,
      },
    });
    await prisma.auditLog.create({ data: { entity: 'Leave', entityId: created.id, action: 'WORKWAY_IMPORT', after: { wwId: String(l.id) } } });
    lc++;
  }
  console.log(`C (leave): imported ${lc} leaves`);

  // Holidays from the phase-1 capture (api-index points at /account/holidays).
  let hc = 0;
  const idxFile = join(DISC, 'api-index.json');
  if (existsSync(idxFile)) {
    const idx = JSON.parse(readFileSync(idxFile, 'utf8'));
    const hit = idx.find((it: any) => /\/account\/holidays/.test(it.url));
    if (hit && existsSync(join(DISC, hit.file))) {
      const body = JSON.parse(readFileSync(join(DISC, hit.file), 'utf8')).body;
      const arr = Array.isArray(body) ? body : body?.data ?? [];
      for (const h of arr) {
        const date = parseDate(h.start ?? h.date);
        const name = ht(h.title ?? h.name);
        if (!date || !name) continue;
        await prisma.holiday.upsert({
          where: { name_date: { name: name.slice(0, 120), date } },
          update: {},
          create: { name: name.slice(0, 120), date },
        }).catch(() => {});
        hc++;
      }
    }
  }
  console.log(`C (holidays): imported ${hc} holidays`);

  console.log('\n✓ P9 backfill done.');
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
