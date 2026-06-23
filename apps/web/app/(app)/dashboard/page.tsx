import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  FolderKanban,
  IndianRupee,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { AiBadge } from '@/components/ai-badge';
import { PortfolioAskDrawer } from '@/components/portfolio-ask-drawer';
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

interface ForecastSummary {
  marginsEroding: number;
  marginsCritical: number;
  overbookedNextMonth: number;
  benchAvailableNextMonth: number;
  staffingMovesSuggested: number;
  expenseSpike: boolean;
  wellbeingAtRisk: number;
}

interface CapacityRow {
  userId: string;
  userName: string;
  gradeCode: string;
  gradeRank: number;
  allocatedPercent: number;
  sparePercent: number;
  status: 'OVERBOOKED' | 'FULL' | 'AVAILABLE' | 'BENCH';
}

interface StaffingMove {
  allocationId: string;
  projectCode: string;
  percent: number;
  fromUserName: string;
  toUserName: string;
  gradeMatch: 'EXACT' | 'ADJACENT';
  costDeltaPerDay: number | null;
  currency: string;
  reasons: string[];
}

interface StaffingPlan {
  window: { start: string; end: string };
  capacity: CapacityRow[];
  moves: StaffingMove[];
  reasons: string[];
}

interface MarginForecastRow {
  projectId: string;
  code: string;
  name: string;
  currentMarginPercent: number | null;
  projectedMarginPercent: number | null;
  trajectory: 'IMPROVING' | 'STABLE' | 'ERODING';
  riskBand: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface WellbeingRow {
  userId: string;
  userName: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  avgWeeklyHours: number;
  reasons: string[];
}

const RISK_TONE: Record<string, string> = {
  CRITICAL: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  HIGH: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  MEDIUM: 'border-amber-500/20 bg-amber-500/5 text-amber-800 dark:text-amber-200',
  LOW: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const STATUS_TONE: Record<'green' | 'amber' | 'red' | 'gray', string> = {
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  red: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
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
  const [kpis, portfolio, utilization, anomalies, openAnomalies, fcSummary, fcMargins, fcWellbeing, fcStaffing] =
    await Promise.all([
      serverFetch<Kpis>('/dashboards/kpis'),
      serverFetch<PortfolioRow[]>('/dashboards/portfolio'),
      serverFetch<UtilizationRow[]>('/dashboards/utilization'),
      serverFetch<Anomalies>('/dashboards/anomalies'),
      serverFetch<Anomaly[]>('/anomalies').catch(() => [] as Anomaly[]),
      // Forecast endpoints are ADMIN-only; degrade gracefully for other roles.
      serverFetch<ForecastSummary>('/forecast/summary').catch(() => null),
      serverFetch<MarginForecastRow[]>('/forecast/margins').catch(() => [] as MarginForecastRow[]),
      serverFetch<WellbeingRow[]>('/forecast/wellbeing').catch(() => [] as WellbeingRow[]),
      serverFetch<StaffingPlan>('/forecast/staffing').catch(() => null),
    ]);

  const dataQuality = await serverFetch<{
    overheadExpenses: string;
    unattributableEffort: string;
    unattributableTimelogs: number;
    projectsMissingBudget: number;
  }>('/dashboards/data-quality').catch(() => null);
  const showDataBanner =
    dataQuality &&
    (Number(dataQuality.overheadExpenses) > 0 ||
      Number(dataQuality.unattributableEffort) > 0 ||
      dataQuality.projectsMissingBudget > 0);

  const atRiskMargins = fcMargins.filter(
    (m) => m.trajectory === 'ERODING' || m.riskBand === 'CRITICAL' || m.riskBand === 'HIGH',
  );

  const benchRows = (fcStaffing?.capacity ?? []).filter(
    (c) => c.status === 'AVAILABLE' || c.status === 'BENCH',
  );
  const hasStaffingInsight = !!fcStaffing && (fcStaffing.moves.length > 0 || benchRows.length > 0);

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
      actions={<PortfolioAskDrawer />}
    >
      {showDataBanner && dataQuality && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
          <span className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Read margins in context — excluded from project P&amp;L:
          </span>
          {Number(dataQuality.overheadExpenses) > 0 && (
            <span>
              <span className="font-mono">{formatMoney(dataQuality.overheadExpenses)}</span> overhead / G&amp;A
            </span>
          )}
          {Number(dataQuality.unattributableEffort) > 0 && (
            <span>
              <span className="font-mono">{formatMoney(dataQuality.unattributableEffort)}</span> unattributed effort
              ({dataQuality.unattributableTimelogs} logs on deleted/project-less tasks)
            </span>
          )}
          {dataQuality.projectsMissingBudget > 0 && (
            <span>
              <span className="font-mono">{dataQuality.projectsMissingBudget}</span> projects missing a budget
            </span>
          )}
        </div>
      )}

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

      {fcSummary && (
        <section className="mt-6">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              Forward-looking risk <AiBadge label="Predictive" />
            </h2>
            <span className="text-[11px] text-muted-foreground">
              Projected from{' '}
              <code className="rounded bg-secondary px-1 py-0.5 font-mono">@ces/forecast</code>
            </span>
          </header>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <ForecastChip label="Margins eroding" value={fcSummary.marginsEroding} tone={fcSummary.marginsEroding ? 'amber' : 'green'} />
            <ForecastChip label="Margins critical" value={fcSummary.marginsCritical} tone={fcSummary.marginsCritical ? 'red' : 'green'} />
            <ForecastChip label="Overbooked next month" value={fcSummary.overbookedNextMonth} tone={fcSummary.overbookedNextMonth ? 'amber' : 'green'} />
            <ForecastChip label="Free next month" value={fcSummary.benchAvailableNextMonth} tone="green" />
            <ForecastChip label="Expense spike" value={fcSummary.expenseSpike ? 'Yes' : 'No'} tone={fcSummary.expenseSpike ? 'red' : 'green'} />
            <ForecastChip label="Wellbeing at risk" value={fcSummary.wellbeingAtRisk} tone={fcSummary.wellbeingAtRisk ? 'amber' : 'green'} />
          </div>

          {atRiskMargins.length > 0 && (
            <Card className="mt-3 p-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Projects trending below target</CardTitle>
                <CardDescription>Current vs projected end-of-engagement margin (linear burn).</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Projected</TableHead>
                      <TableHead>Trajectory</TableHead>
                      <TableHead>Risk</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atRiskMargins.map((m) => (
                      <TableRow key={m.projectId}>
                        <TableCell className="text-xs">
                          <span className="font-mono">{m.code}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {m.currentMarginPercent == null ? '—' : `${m.currentMarginPercent}%`}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {m.projectedMarginPercent == null ? '—' : `${m.projectedMarginPercent}%`}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 text-xs">
                            {m.trajectory === 'ERODING' && <TrendingDown className="h-3 w-3 text-red-700 dark:text-red-400" />}
                            {m.trajectory}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={`border text-[10px] ${RISK_TONE[m.riskBand]}`}>{m.riskBand}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {fcWellbeing.length > 0 && (
            <Card className="mt-3">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Workload watch
                </CardTitle>
                <CardDescription>Sustained high on-site hours — consider redistributing load.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {fcWellbeing.map((w) => (
                  <div key={w.userId} className="flex items-center justify-between text-xs">
                    <span>{w.userName}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {w.avgWeeklyHours}h/wk avg
                      <Badge className={`border text-[10px] ${RISK_TONE[w.riskLevel]}`}>{w.riskLevel}</Badge>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {hasStaffingInsight && fcStaffing && (
            <Card className="mt-3">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-primary" /> Resource optimization
                </CardTitle>
                <CardDescription>
                  Next month ({fcStaffing.window.start} → {fcStaffing.window.end}). Suggestions only — a PM confirms;
                  nothing is auto-assigned.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {fcStaffing.moves.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                      Suggested reassignments to relieve overbooking
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Move</TableHead>
                          <TableHead>From → To</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead className="text-right">Cost/day Δ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fcStaffing.moves.map((m) => (
                          <TableRow key={m.allocationId} title={m.reasons.join('\n')}>
                            <TableCell className="text-xs">
                              <span className="font-mono">{m.percent}%</span> · {m.projectCode}
                            </TableCell>
                            <TableCell className="text-xs">
                              <span className="inline-flex items-center gap-1">
                                {m.fromUserName} <ArrowRight className="h-3 w-3 text-muted-foreground" /> {m.toUserName}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge className="border text-[10px]">{m.gradeMatch}</Badge>
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono text-xs ${
                                m.costDeltaPerDay != null && m.costDeltaPerDay < 0
                                  ? 'text-green-700 dark:text-green-400'
                                  : m.costDeltaPerDay != null && m.costDeltaPerDay > 0
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-muted-foreground'
                              }`}
                            >
                              {m.costDeltaPerDay == null
                                ? '—'
                                : m.costDeltaPerDay === 0
                                  ? 'neutral'
                                  : `${m.costDeltaPerDay < 0 ? '−' : '+'}${Math.abs(m.costDeltaPerDay)} ${m.currency}`}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {benchRows.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Who&apos;s free</div>
                    <div className="flex flex-wrap gap-1.5">
                      {benchRows.map((c) => (
                        <span
                          key={c.userId}
                          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]"
                        >
                          <span>{c.userName}</span>
                          <span className="font-mono text-muted-foreground">{c.gradeCode}</span>
                          <span className="text-muted-foreground">{c.sparePercent}% free</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {fcStaffing.reasons.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">{fcStaffing.reasons.join(' · ')}</p>
                )}
              </CardContent>
            </Card>
          )}

          {atRiskMargins.length === 0 && fcWellbeing.length === 0 && !hasStaffingInsight && (
            <p className="mt-2 text-xs text-muted-foreground">
              No forward-looking risks detected — margins on track, no overbookings or workload flags.
            </p>
          )}
        </section>
      )}

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
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : margin >= 15
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-red-700 dark:text-red-400';
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
                <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" /> No flagged receipts.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {anomalies.receiptFlags.slice(0, 6).map((f) => (
                  <li key={f.id} className="p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={
                          f.severity === 'BLOCK'
                            ? 'mt-0.5 h-3.5 w-3.5 text-red-700 dark:text-red-400'
                            : 'mt-0.5 h-3.5 w-3.5 text-amber-700 dark:text-amber-400'
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
                <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" /> No allocation conflicts.
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
              <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" /> No open anomalies. Run the
              detector from the rules page to scan again.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {openAnomalies.slice(0, 8).map((a) => {
                const sevClass =
                  a.severity === 'CRITICAL'
                    ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                    : a.severity === 'WARN'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300';
                return (
                  <li key={a.id} className="p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={
                          a.severity === 'CRITICAL'
                            ? 'mt-0.5 h-3.5 w-3.5 text-red-700 dark:text-red-400'
                            : a.severity === 'WARN'
                              ? 'mt-0.5 h-3.5 w-3.5 text-amber-700 dark:text-amber-400'
                              : 'mt-0.5 h-3.5 w-3.5 text-blue-700 dark:text-blue-400'
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
    ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
    : total >= 80
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return <Badge className={`border ${tone}`}>{total}%</Badge>;
}

function ForecastChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'green' | 'amber' | 'red';
}) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${STATUS_TONE[tone]}`}>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] opacity-80">{label}</div>
    </div>
  );
}
