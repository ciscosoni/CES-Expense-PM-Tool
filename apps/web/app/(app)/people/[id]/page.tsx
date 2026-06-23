import Link from 'next/link';
import { ArrowLeft, CalendarDays, Clock, Briefcase, Users as UsersIcon } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { serverFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

interface Profile {
  id: string;
  displayName: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  roles: string[];
  active: boolean;
  employmentType: string | null;
  joiningDate: string | null;
  manager: { id: string; displayName: string } | null;
  grade: { id: string; code: string; name: string } | null;
  reportsCount: number;
  allocations: Array<{
    project: { id: string; code: string; name: string };
    percent: number;
    periodStart: string;
    periodEnd: string;
  }>;
  rollups: {
    currentAllocationPercent: number;
    leaveApprovedThisYear: number;
    leavePending: number;
    hoursLast30: number;
    billableLast30: number;
  };
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? '—'
    : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value || '—'}</p>
    </div>
  );
}

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await serverFetch<Profile>(`/users/${id}/profile`).catch(() => null);

  if (!p) {
    return (
      <AdminShell title="Employee">
        <Card className="p-8 text-sm text-muted-foreground">Employee not found.</Card>
      </AdminShell>
    );
  }

  const initials = p.displayName
    .split(' ')
    .map((x) => x[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <AdminShell
      title={
        <span className="flex items-center gap-3">
          <span className="brand-surface grid h-9 w-9 place-items-center rounded-full text-xs font-semibold text-white">
            {initials}
          </span>
          {p.displayName}
        </span>
      }
      description={`${p.jobTitle || 'Employee'}${p.department ? ` · ${p.department}` : ''}`}
      actions={
        <Link href="/people" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All employees
        </Link>
      }
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        {p.active ? (
          <Badge variant="success" dot>
            Active
          </Badge>
        ) : (
          <Badge variant="outline">Inactive</Badge>
        )}
        {p.employmentType && <Badge variant="info">{p.employmentType.replace(/_/g, ' ')}</Badge>}
        {p.roles.map((r) => (
          <Badge key={r} variant="outline" className="text-[9px]">
            {r.replace(/_/g, ' ')}
          </Badge>
        ))}
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Allocated now"
          value={p.rollups.currentAllocationPercent}
          percent
          hint={`${p.allocations.length} active project${p.allocations.length === 1 ? '' : 's'}`}
          tone={p.rollups.currentAllocationPercent > 100 ? 'negative' : 'primary'}
          icon={<Briefcase className="h-4 w-4" />}
        />
        <StatCard
          index={1}
          label="Hours · last 30d"
          value={p.rollups.hoursLast30}
          decimals={1}
          hint={`${p.rollups.billableLast30}h billable`}
          tone="positive"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          index={2}
          label="Leave taken (yr)"
          value={p.rollups.leaveApprovedThisYear}
          decimals={1}
          hint={`${p.rollups.leavePending} pending`}
          tone="muted"
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <StatCard
          index={3}
          label="Direct reports"
          value={p.reportsCount}
          hint="Team size"
          tone="muted"
          icon={<UsersIcon className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="p-5">
          <p className="mb-4 text-sm font-semibold">Profile</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email" value={p.email} />
            <Field label="Department" value={p.department} />
            <Field label="Designation" value={p.jobTitle} />
            <Field label="Grade" value={p.grade ? `${p.grade.code} · ${p.grade.name}` : '—'} />
            <Field
              label="Manager"
              value={
                p.manager ? (
                  <Link href={`/people/${p.manager.id}`} className="hover:underline">
                    {p.manager.displayName}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            <Field label="Joined" value={fmtDate(p.joiningDate)} />
          </div>
        </Card>

        <Card className="p-0">
          <div className="border-b border-border/60 px-5 py-3 text-sm font-semibold">
            Current allocations
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Project</TableHead>
                <TableHead className="w-24 text-right">Allocation</TableHead>
                <TableHead className="w-40">Period</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.allocations.length === 0 && (
                <TableEmpty colSpan={3}>No active allocations.</TableEmpty>
              )}
              {p.allocations.map((a) => (
                <TableRow key={a.project.id}>
                  <TableCell className="text-sm">
                    <Link href={`/projects/${a.project.id}`} className="hover:underline">
                      <span className="font-mono text-xs text-muted-foreground">{a.project.code}</span>{' '}
                      {a.project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{a.percent}%</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtDate(a.periodStart)} → {fmtDate(a.periodEnd)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AdminShell>
  );
}
