import Link from 'next/link';
import { Clock, ListChecks, BadgeCheck, Percent } from 'lucide-react';
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

interface TimesheetRow {
  id: string;
  date: string;
  hours: number;
  billable: boolean;
  notes: string | null;
  user: { id: string; displayName: string };
  taskName: string;
  project: { id: string; code: string; name: string } | null;
}
interface TimesheetResp {
  logs: TimesheetRow[];
  summary: {
    count: number;
    totalHours: number;
    billableHours: number;
    billablePercent: number;
    capped: boolean;
  };
}

const EMPTY: TimesheetResp = {
  logs: [],
  summary: { count: 0, totalHours: 0, billableHours: 0, billablePercent: 0, capped: false },
};

function fmtDate(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? d.slice(0, 10)
    : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ billable?: string }>;
}) {
  const sp = await searchParams;
  const billableOnly = sp.billable === 'true';
  const qs = billableOnly ? '?billable=true' : '';
  const data = await serverFetch<TimesheetResp>(`/time-logs${qs}`).catch(() => EMPTY);
  const { logs, summary } = data;

  return (
    <AdminShell
      title="Timesheets"
      description="Time logged across projects — visibility-scoped. Managers see their teams; engineers see their own."
      actions={
        <div className="flex items-center gap-1.5 text-xs">
          <Link
            href="/timesheets"
            className={`rounded-md border px-2.5 py-1 font-medium transition-colors ${!billableOnly ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground hover:text-foreground'}`}
          >
            All
          </Link>
          <Link
            href="/timesheets?billable=true"
            className={`rounded-md border px-2.5 py-1 font-medium transition-colors ${billableOnly ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground hover:text-foreground'}`}
          >
            Billable only
          </Link>
        </div>
      }
    >
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Hours logged"
          value={summary.totalHours}
          decimals={1}
          hint={`${summary.count} entries${summary.capped ? ' (showing latest 500)' : ''}`}
          tone="primary"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          index={1}
          label="Billable hours"
          value={summary.billableHours}
          decimals={1}
          hint="Counts toward T&M revenue"
          tone="positive"
          icon={<BadgeCheck className="h-4 w-4" />}
        />
        <StatCard
          index={2}
          label="Billable share"
          value={summary.billablePercent}
          percent
          hint={summary.billablePercent >= 70 ? 'Healthy utilization' : 'Watch'}
          tone={summary.billablePercent >= 70 ? 'positive' : 'muted'}
          icon={<Percent className="h-4 w-4" />}
        />
        <StatCard
          index={3}
          label="Entries"
          value={summary.count}
          hint="Time-log rows in view"
          tone="muted"
          icon={<ListChecks className="h-4 w-4" />}
        />
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-20">Date</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead className="w-28">Project</TableHead>
              <TableHead>Task</TableHead>
              <TableHead className="w-20 text-right">Hours</TableHead>
              <TableHead className="w-24">Billable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 && <TableEmpty colSpan={6}>No time logged yet.</TableEmpty>}
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(l.date)}</TableCell>
                <TableCell className="text-sm">{l.user.displayName}</TableCell>
                <TableCell className="font-mono text-xs">
                  {l.project ? (
                    <Link href={`/projects/${l.project.id}`} className="hover:underline">
                      {l.project.code}
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="max-w-0 truncate text-xs" title={l.notes ?? undefined}>
                  {l.taskName}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {l.hours.toFixed(2)}
                </TableCell>
                <TableCell>
                  {l.billable ? (
                    <Badge variant="success" dot>
                      Billable
                    </Badge>
                  ) : (
                    <Badge variant="outline">Internal</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AdminShell>
  );
}
