import { AlertTriangle, IndianRupee, Percent, TrendingUp, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { serverFetch } from '@/lib/server-api';
import { formatMoney } from '@/lib/format';
import { AskAiDrawer } from '@/components/ask-ai-drawer';
import type { PnlResult, ProjectBaseline } from '@/lib/types';

export default async function ProjectPnlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pnl, baseline, dq] = await Promise.all([
    serverFetch<PnlResult>(`/projects/${id}/pnl`),
    serverFetch<ProjectBaseline>(`/change-requests/projects/${id}/baseline`).catch(() => null),
    serverFetch<{
      isOverheadBucket: boolean;
      noBudget: boolean;
      budgetIsPlaceholder: boolean;
      overheadExpenses: string;
      unattributableEffort: string;
      unattributableTimelogs: number;
    }>(`/dashboards/projects/${id}/data-quality`).catch(() => null),
  ]);
  const ccy = pnl.revenue.currency;
  const rows: { label: string; amount: string; muted?: boolean }[] = [
    { label: 'Effort cost (time logs × cost rate)', amount: pnl.costBreakdown.effort },
    { label: 'Travel', amount: pnl.costBreakdown.travel, muted: true },
    { label: 'Lodging', amount: pnl.costBreakdown.lodging, muted: true },
    { label: 'DA (per-diem)', amount: pnl.costBreakdown.da, muted: true },
    { label: 'Local conveyance', amount: pnl.costBreakdown.localConveyance, muted: true },
    { label: 'Other expenses', amount: pnl.costBreakdown.otherExpenses, muted: true },
    { label: 'Other direct costs', amount: pnl.costBreakdown.otherDirect, muted: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Project P&amp;L</h2>
          <p className="text-sm text-muted-foreground">
            Every figure is derived live from the underlying records.
          </p>
        </div>
        <AskAiDrawer entityKind="PROJECT" entityId={id} title={`${ccy} P&L`} />
      </div>

      {dq?.isOverheadBucket && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <span className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Not a real project — this is the overhead / G&amp;A
            bucket. Excluded from portfolio margin.
          </span>
          <span>
            <span className="font-mono">{formatMoney(dq.overheadExpenses, ccy)}</span> non-project
            expenses (rent, salaries, petty cash)
          </span>
          <span>
            <span className="font-mono">{formatMoney(dq.unattributableEffort, ccy)}</span> effort on{' '}
            {dq.unattributableTimelogs} deleted/project-less tasks
          </span>
        </div>
      )}
      {dq?.noBudget && (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="font-medium">No contract value set</span> — revenue is zero, so margin
          isn&apos;t meaningful until a budget is entered.
        </div>
      )}
      {dq?.budgetIsPlaceholder && (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="font-medium">Placeholder budget</span> — Workway had no contract value,
          so the budget was seeded at break-even (= cost). Margin reads ~0% until a real contract
          value is entered.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          index={0}
          label="Revenue"
          value={Number(pnl.revenue.amount)}
          money
          currency={ccy}
          tone="positive"
          icon={<IndianRupee className="h-4 w-4" />}
        />
        <StatCard
          index={1}
          label="Total cost"
          value={Number(pnl.cost.amount)}
          money
          currency={ccy}
          tone="muted"
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          index={2}
          label="Gross profit"
          value={Number(pnl.grossProfit.amount)}
          money
          currency={ccy}
          tone={Number(pnl.grossProfit.amount) >= 0 ? 'positive' : 'negative'}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          index={3}
          label="Margin"
          value={pnl.marginPercent ?? 0}
          percent
          decimals={2}
          placeholder={pnl.marginPercent === null ? '—' : undefined}
          tone={
            pnl.marginPercent === null
              ? 'muted'
              : pnl.marginPercent >= 30
                ? 'positive'
                : pnl.marginPercent < 15
                  ? 'negative'
                  : 'primary'
          }
          icon={<Percent className="h-4 w-4" />}
        />
      </div>

      {baseline && (
        <Card>
          <CardHeader>
            <CardTitle>Baseline vs current</CardTitle>
            <CardDescription>
              Snapshot taken at first save vs the live project after approved Change Requests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead className="text-right">Baseline</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Contract value</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatMoney(baseline.baseline.contractValue, baseline.baseline.contractCurrency)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatMoney(baseline.current.contractValue, baseline.current.contractCurrency)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {signedMoney(baseline.delta.contractValue, baseline.current.contractCurrency)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Budget</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {baseline.baseline.budget
                      ? formatMoney(
                          baseline.baseline.budget,
                          baseline.baseline.budgetCurrency ?? ccy,
                        )
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {baseline.current.budget
                      ? formatMoney(
                          baseline.current.budget,
                          baseline.current.budgetCurrency ?? ccy,
                        )
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {signedMoney(baseline.delta.budget, baseline.current.budgetCurrency ?? ccy)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Planned end</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {baseline.baseline.plannedEnd}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {baseline.current.plannedEnd}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {baseline.delta.days
                      ? `${baseline.delta.days > 0 ? '+' : ''}${baseline.delta.days}d`
                      : '0d'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cost breakdown</CardTitle>
          <CardDescription>
            Every line is derived live from the underlying records. Travel/lodging/DA wire in once
            the Travel + Expenses modules land in Slice 1C.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className={r.muted ? 'text-muted-foreground' : ''}>
                    {r.label}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-xs ${r.muted ? 'text-muted-foreground' : ''}`}
                  >
                    {formatMoney(r.amount, ccy)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total cost</TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(pnl.costBreakdown.total, ccy)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function signedMoney(amount: string, currency: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return formatMoney('0', currency);
  const sign = n > 0 ? '+' : '';
  return `${sign}${formatMoney(amount, currency)}`;
}
