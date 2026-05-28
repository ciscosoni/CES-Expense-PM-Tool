import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkline } from '@/components/sparkline';
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
      title="Live Operations"
      description={
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          One source of truth · refreshes on each load <AiBadge label="AI insights soon" />
        </span>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Active projects"
          value={kpis.activeProjects.toString()}
          hint={`${kpis.flaggedReceipts} flagged receipts open`}
          spark={trendLine(kpis.activeProjects || 1, 10, 0.05)}
          tone="primary"
        />
        <KpiCard
          label="Portfolio revenue"
          value={formatMoney(kpis.portfolioRevenue)}
          hint={`Cost ${formatMoney(kpis.portfolioCost)}`}
          spark={trendLine(Number(kpis.portfolioRevenue) || 1)}
          tone="positive"
        />
        <KpiCard
          label="Margin"
          value={kpis.portfolioMargin !== null ? `${kpis.portfolioMargin.toFixed(1)}%` : '—'}
          hint={kpis.portfolioMargin !== null && kpis.portfolioMargin >= 30 ? 'Healthy' : 'Watch'}
          spark={trendLine(kpis.portfolioMargin ?? 0)}
          tone={
            kpis.portfolioMargin !== null && kpis.portfolioMargin >= 30
              ? 'positive'
              : kpis.portfolioMargin !== null && kpis.portfolioMargin < 15
                ? 'negative'
                : 'primary'
          }
          icon={<MarginIcon className="h-3.5 w-3.5" />}
        />
        <KpiCard
          label="Pending approvals"
          value={kpis.pendingApprovals.toString()}
          hint={`Reimb ${formatMoney(kpis.pendingReimbursementAmount)} · Paid MTD ${formatMoney(kpis.reimbursedThisMonth)}`}
          spark={trendLine(kpis.pendingApprovals || 1, 10, 0.12)}
          tone="muted"
        />
      </div>

      <section className="mt-8">
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
                        <p>
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
                        </p>
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
          </Card>
        </section>
      </div>

      <Card tone="ai" className="mt-8">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardDescription className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> AI · coming soon
            </CardDescription>
            <CardTitle className="text-lg">
              Project onboarding from RFP / email chain / scope docs
            </CardTitle>
          </div>
          <AiBadge label="Slice 2C" />
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Drop in a Project Owner&apos;s RFP, email thread, and statement of work. Claude generates
          the project charter, work breakdown, milestones, and team-role suggestions — Owner reviews
          and one-click commits.
        </CardContent>
      </Card>
    </AdminShell>
  );
}

function KpiCard({
  label,
  value,
  hint,
  spark,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  spark: number[];
  tone: 'primary' | 'positive' | 'negative' | 'muted';
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="mt-1 text-2xl">
            <span className="flex items-center gap-1.5">
              {value}
              {icon}
            </span>
          </CardTitle>
        </div>
        <Sparkline values={spark} tone={tone} width={88} height={28} />
      </CardHeader>
      {hint && (
        <CardContent>
          <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
        </CardContent>
      )}
    </Card>
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
