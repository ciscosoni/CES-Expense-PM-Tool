import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  FolderKanban,
  IndianRupee,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { AiBadge } from '@/components/ai-badge';
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
import type { Anomaly } from '@/lib/types';

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
  allocations: Array<{ projectCode: string; percent: number }>;
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

const STATUS_TONE: Record<'green' | 'amber' | 'red' | 'gray', string> = {
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  red: 'border-red-500/30 bg-red-500/10 text-red-300',
  gray: 'border-border bg-secondary text-muted-foreground',
};

/** Stable pseudo-sparkline so the cards aren't dead-flat with one data point. */
function trendLine(value: number, steps = 10, jitter = 0.08): number[] {
  const out: number[] = [];
  let cur = value * 0.85;
  for (let i = 0; i < steps; i++) {
    const noise = (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * jitter;
    cur = cur + (value - cur) * 0.18 + noise * value;
    out.push(cur);
  }
  out[out.length - 1] = value;
  return out;
}

export default async function DashboardPage() {
  const [kpis, portfolio, utilization, anomalies, openAnomalies] = await Promise.all([
    serverFetch<Kpis>('/dashboards/kpis'),
    serverFetch<PortfolioRow[]>('/dashboards/portfolio'),
    serverFetch<UtilizationRow[]>('/dashboards/utilization'),
    serverFetch<Anomalies>('/dashboards/anomalies'),
    serverFetch<Anomaly[]>('/anomalies').catch(() => [] as Anomaly[]),
  ]);

  const MarginIcon =
    kpis.portfolioMargin !== null && kpis.portfolioMargin < 0 ? TrendingDown : TrendingUp;

  return (
    <AdminShell
      title="Live Operations"
      description={
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          One source of truth · refreshes on each load <AiBadge label="AI insights soon" />
        </span>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Active projects"
          value={kpis.activeProjects}
          hint={`${kpis.flaggedReceipts} flagged receipts open`}
          spark={trendLine(kpis.activeProjects || 1, 10, 0.05)}
          tone="primary"
          icon={<FolderKanban className="h-4 w-4" />}
        />
        <StatCard
          index={1}
          label="Portfolio revenue"
          value={Number(kpis.portfolioRevenue)}
          money
          hint={`Cost ${formatMoney(kpis.portfolioCost)}`}
          spark={trendLine(Number(kpis.portfolioRevenue) || 1)}
          tone="positive"
          icon={<IndianRupee className="h-4 w-4" />}
        />
        <StatCard
          index={2}
          label="Margin"
          value={kpis.portfolioMargin ?? 0}
          percent
          decimals={1}
          placeholder={kpis.portfolioMargin === null ? '—' : undefined}
          hint={kpis.portfolioMargin !== null && kpis.portfolioMargin >= 30 ? 'Healthy' : 'Watch'}
          spark={trendLine(kpis.portfolioMargin ?? 0)}
          tone={
            kpis.portfolioMargin !== null && kpis.portfolioMargin >= 30
              ? 'positive'
              : kpis.portfolioMargin !== null && kpis.portfolioMargin < 15
                ? 'negative'
                : 'primary'
          }
          icon={<MarginIcon className="h-4 w-4" />}
        />
        <StatCard
          index={3}
          label="Pending approvals"
          value={kpis.pendingApprovals}
          hint={`Reimb ${formatMoney(kpis.pendingReimbursementAmount)} · Paid MTD ${formatMoney(kpis.reimbursedThisMonth)}`}
          spark={trendLine(kpis.pendingApprovals || 1, 10, 0.12)}
          tone="muted"
          icon={<Timer className="h-4 w-4" />}
        />
      </div>

      <section className="mt-6">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Portfolio P&amp;L</h2>
          <span className="text-[11px] text-muted-foreground">
            Live from{' '}
            <code className="rounded bg-secondary px-1 py-0.5 font-mono">@ces/pnl-engine</code>
          </span>
        </header>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-40">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-32 text-right">Contract</TableHead>
                <TableHead className="w-32 text-right">Revenue</TableHead>
                <TableHead className="w-28 text-right">Cost</TableHead>
                <TableHead className="w-32 text-right">GP</TableHead>
                <TableHead className="w-24 text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolio.length === 0 && <TableEmpty colSpan={8}>No projects yet.</TableEmpty>}
              {portfolio.map((p) => {
                const tone = STATUS_TONE[projectStatusColor(p.status)];
                const margin = p.marginPercent;
                const marginColor =
                  margin === null
                    ? 'text-muted-foreground'
                    : margin >= 30
                      ? 'text-emerald-400'
                      : margin >= 15
                        ? 'text-amber-400'
                        : 'text-red-400';
                return (
                  <TableRow key={p.id} className="transition-colors hover:bg-accent/40">
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/projects/${p.id}`}
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        {p.code}
                        <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{p.name}</TableCell>
                    <TableCell>
                      <Badge className={`border ${tone}`}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {formatMoney(p.contractValue, p.contractCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatMoney(p.revenue, p.contractCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
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
        </Card>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-tight">
            Resource utilization · this month
          </h2>
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Engineer</TableHead>
                  <TableHead className="w-28 text-right">Total</TableHead>
                  <TableHead>Projects</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {utilization.length === 0 && (
                  <TableEmpty colSpan={3}>No allocations this month.</TableEmpty>
                )}
                {utilization.map((u) => (
                  <TableRow key={u.user.id} className="hover:bg-accent/40">
                    <TableCell className="text-sm">{u.user.displayName}</TableCell>
                    <TableCell className="text-right">
                      <AllocationPill total={u.totalAllocation} conflict={u.conflict} />
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {u.allocations.map((a) => `${a.projectCode} ${a.percent}%`).join(' · ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-tight">Anomalies feed</h2>
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border/60 px-4 py-2.5 text-xs">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground">
                Receipt flags
                <span className="ml-2 font-mono text-foreground">
                  {anomalies.receiptFlags.length}
                </span>
              </p>
            </div>
            {anomalies.receiptFlags.length === 0 ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> No flagged receipts.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {anomalies.receiptFlags.slice(0, 6).map((f) => (
                  <li key={f.id} className="p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={
                          f.severity === 'BLOCK'
                            ? 'mt-0.5 h-3.5 w-3.5 text-red-400'
                            : 'mt-0.5 h-3.5 w-3.5 text-amber-400'
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                          <Badge variant="outline" className="mr-1 text-[9px]">
                            {f.severity}
                          </Badge>
                          <span className="font-semibold">{f.kind.replace(/_/g, ' ')}</span>{' '}
                          <span className="text-muted-foreground">— {f.user.displayName}</span> ·{' '}
                          <Link
                            href={`/projects/${f.project.id}`}
                            className="font-mono hover:underline"
                          >
                            {f.project.code}
                          </Link>{' '}
                          · {formatMoney(f.expense.amount, f.expense.currency)}
                        </div>
                        {f.detail && <p className="mt-0.5 text-muted-foreground">{f.detail}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-y border-border/60 bg-secondary/30 px-4 py-2.5 text-xs">
              <p className="font-semibold uppercase tracking-wider text-muted-foreground">
                Overbooked engineers
                <span className="ml-2 font-mono text-foreground">
                  {anomalies.overbookedEngineers.length}
                </span>
              </p>
            </div>
            {anomalies.overbookedEngineers.length === 0 ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> No allocation conflicts.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {anomalies.overbookedEngineers.map((u) => (
                  <li key={u.user.id} className="p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                      <Badge variant="destructive" className="mr-1 text-[9px]">
                        {u.totalAllocation}%
                      </Badge>
                      <span className="font-semibold">{u.user.displayName}</span> — {u.projects}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      <section className="mt-6">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Open anomalies</h2>
          <span className="text-[11px] text-muted-foreground">
            From{' '}
            <code className="rounded bg-secondary px-1 py-0.5 font-mono">/anomalies/detect</code> ·{' '}
            <Link href="/admin/anomaly-rules" className="hover:underline">
              tune rules
            </Link>
          </span>
        </header>
        <Card className="overflow-hidden p-0">
          {openAnomalies.length === 0 ? (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-400" /> No open anomalies. Run the
              detector from the rules page to scan again.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {openAnomalies.slice(0, 8).map((a) => {
                const sevClass =
                  a.severity === 'CRITICAL'
                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : a.severity === 'WARN'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      : 'border-blue-500/30 bg-blue-500/10 text-blue-300';
                return (
                  <li key={a.id} className="p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={
                          a.severity === 'CRITICAL'
                            ? 'mt-0.5 h-3.5 w-3.5 text-red-400'
                            : a.severity === 'WARN'
                              ? 'mt-0.5 h-3.5 w-3.5 text-amber-400'
                              : 'mt-0.5 h-3.5 w-3.5 text-blue-400'
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                          <Badge className={`mr-1 border text-[9px] ${sevClass}`}>
                            {a.severity}
                          </Badge>
                          <span className="font-semibold">{a.kind.replace(/_/g, ' ')}</span>
                        </div>
                        {a.detail && (
                          <p className="mt-0.5 text-muted-foreground">{a.detail}</p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <Card tone="ai" className="mt-6">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardDescription className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> AI · Live
            </CardDescription>
            <CardTitle className="text-lg">
              Onboard a new project from an RFP, email thread, or SOW
            </CardTitle>
          </div>
          <AiBadge label="Claude" />
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <p className="max-w-xl">
            Paste the deal artifact and Claude drafts the project — milestones, tasks, team
            allocation (utilization-aware), budget, and a P&amp;L forecast. Owner reviews and
            one-click commits.
          </p>
          <Link
            href="/projects/onboard"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gradient-to-r from-[hsl(var(--ai-from))] via-[hsl(var(--ai-via))] to-[hsl(var(--ai-to))] px-4 text-sm font-medium text-white shadow-lg transition hover:opacity-90"
          >
            <Sparkles className="h-3.5 w-3.5" /> Try AI onboarding
          </Link>
        </CardContent>
      </Card>
    </AdminShell>
  );
}

function AllocationPill({ total, conflict }: { total: number; conflict: boolean }) {
  const tone = conflict
    ? 'border-red-500/30 bg-red-500/10 text-red-300'
    : total >= 80
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return <Badge className={`border ${tone}`}>{total}%</Badge>;
}
