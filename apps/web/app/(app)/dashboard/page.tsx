import Link from 'next/link';
import { AlertTriangle, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { formatMoney, projectStatusColor } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface Kpis {
  activeProjects: number;
  portfolioRevenue: string;
  portfolioCost: string;
  portfolioMargin: number | null;
  pendingApprovals: number;
  pendingReimbursementAmount: string;
  reimbursedThisMonth: string;
  flaggedReceipts: number;
}

interface PortfolioRow {
  id: string;
  code: string;
  name: string;
  status: string;
  contractValue: string;
  contractCurrency: string;
  revenue: string;
  cost: string;
  grossProfit: string;
  marginPercent: number | null;
}

interface UtilizationRow {
  user: { id: string; displayName: string; email: string };
  totalAllocation: number;
  allocations: Array<{
    projectCode: string;
    percent: number;
  }>;
  conflict: boolean;
}

interface Anomalies {
  receiptFlags: Array<{
    id: string;
    kind: string;
    severity: string;
    detail: string | null;
    expense: { id: string; amount: string; currency: string };
    user: { id: string; displayName: string };
    project: { id: string; code: string; name: string };
    createdAt: string;
  }>;
  overbookedEngineers: Array<{
    user: { id: string; displayName: string };
    totalAllocation: number;
    projects: string;
  }>;
}

const STATUS_COLOR = {
  green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  gray: 'bg-neutral-100 text-neutral-700 border-neutral-200',
} as const;

export default async function DashboardPage() {
  const [kpis, portfolio, utilization, anomalies] = await Promise.all([
    serverFetch<Kpis>('/dashboards/kpis'),
    serverFetch<PortfolioRow[]>('/dashboards/portfolio'),
    serverFetch<UtilizationRow[]>('/dashboards/utilization'),
    serverFetch<Anomalies>('/dashboards/anomalies'),
  ]);

  const MarginIcon =
    kpis.portfolioMargin !== null && kpis.portfolioMargin < 0 ? TrendingDown : TrendingUp;

  return (
    <AdminShell
      title="Leadership Live Ops"
      description="Single source of truth: portfolio P&L, pending approvals, anomalies. Refreshes on each load."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Active projects</CardDescription>
            <CardTitle className="text-3xl font-mono">{kpis.activeProjects}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Portfolio revenue (recognized)</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {formatMoney(kpis.portfolioRevenue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="-mt-2 text-xs text-muted-foreground">
            Cost so far {formatMoney(kpis.portfolioCost)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Portfolio margin</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl font-mono">
              <MarginIcon className="h-5 w-5" />
              {kpis.portfolioMargin !== null ? `${kpis.portfolioMargin.toFixed(2)}%` : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Pending approvals · Outflow</CardDescription>
            <CardTitle className="text-2xl font-mono">{kpis.pendingApprovals}</CardTitle>
          </CardHeader>
          <CardContent className="-mt-2 text-xs text-muted-foreground">
            Reimburse pending {formatMoney(kpis.pendingReimbursementAmount)} · Paid MTD{' '}
            {formatMoney(kpis.reimbursedThisMonth)}
          </CardContent>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold">Portfolio P&L</h2>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="text-right w-32">Contract</TableHead>
                <TableHead className="text-right w-32">Revenue</TableHead>
                <TableHead className="text-right w-32">Cost</TableHead>
                <TableHead className="text-right w-32">GP</TableHead>
                <TableHead className="text-right w-24">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolio.length === 0 && <TableEmpty colSpan={8}>No projects yet.</TableEmpty>}
              {portfolio.map((p) => {
                const color = STATUS_COLOR[projectStatusColor(p.status)];
                const margin = p.marginPercent;
                const marginColor =
                  margin === null
                    ? 'text-muted-foreground'
                    : margin >= 30
                      ? 'text-emerald-700'
                      : margin >= 15
                        ? 'text-amber-700'
                        : 'text-destructive';
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/projects/${p.id}`} className="hover:underline">
                        {p.code}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{p.name}</TableCell>
                    <TableCell>
                      <Badge className={`border ${color}`}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatMoney(p.contractValue, p.contractCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatMoney(p.revenue, p.contractCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatMoney(p.cost, p.contractCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatMoney(p.grossProfit, p.contractCurrency)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-xs font-semibold ${marginColor}`}
                    >
                      {margin !== null ? `${margin.toFixed(1)}%` : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Resource utilization (this month)</h2>
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Engineer</TableHead>
                  <TableHead className="text-right w-28">Total %</TableHead>
                  <TableHead>Projects</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {utilization.length === 0 && (
                  <TableEmpty colSpan={3}>No allocations this month.</TableEmpty>
                )}
                {utilization.map((u) => (
                  <TableRow key={u.user.id}>
                    <TableCell>{u.user.displayName}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        className={`border ${
                          u.conflict
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : u.totalAllocation >= 80
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                              : 'bg-amber-100 text-amber-700 border-amber-200'
                        }`}
                      >
                        {u.totalAllocation}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.allocations.map((a) => `${a.projectCode} ${a.percent}%`).join(' · ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Anomalies feed</h2>
          <div className="rounded-md border bg-card">
            <div className="border-b p-3 text-xs">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground">
                Receipt flags ({anomalies.receiptFlags.length})
              </p>
            </div>
            {anomalies.receiptFlags.length === 0 ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> No flagged receipts.
              </p>
            ) : (
              <ul className="divide-y">
                {anomalies.receiptFlags.slice(0, 8).map((f) => (
                  <li key={f.id} className="p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={
                          f.severity === 'BLOCK'
                            ? 'h-3.5 w-3.5 text-destructive'
                            : 'h-3.5 w-3.5 text-amber-600'
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p>
                          <Badge variant="outline" className="mr-1 text-[9px]">
                            {f.severity}
                          </Badge>
                          <span className="font-semibold">{f.kind.replace(/_/g, ' ')}</span>
                          {' — '}
                          <span className="text-muted-foreground">{f.user.displayName}</span> ·{' '}
                          <Link
                            href={`/projects/${f.project.id}`}
                            className="font-mono hover:underline"
                          >
                            {f.project.code}
                          </Link>{' '}
                          · {formatMoney(f.expense.amount, f.expense.currency)}
                        </p>
                        {f.detail && <p className="mt-0.5 text-muted-foreground">{f.detail}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-y bg-muted/30 p-3 text-xs">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground">
                Overbooked engineers ({anomalies.overbookedEngineers.length})
              </p>
            </div>
            {anomalies.overbookedEngineers.length === 0 ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> No allocation conflicts.
              </p>
            ) : (
              <ul className="divide-y">
                {anomalies.overbookedEngineers.map((u) => (
                  <li key={u.user.id} className="p-3 text-xs">
                    <p>
                      <Badge variant="destructive" className="mr-1 text-[9px]">
                        {u.totalAllocation}%
                      </Badge>
                      <span className="font-semibold">{u.user.displayName}</span> — {u.projects}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
