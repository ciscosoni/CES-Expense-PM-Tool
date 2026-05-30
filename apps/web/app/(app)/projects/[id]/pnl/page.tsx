import { IndianRupee, Percent, TrendingUp, Wallet } from 'lucide-react';
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
import type { PnlResult, ProjectBaseline } from '@/lib/types';

export default async function ProjectPnlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pnl, baseline] = await Promise.all([
    serverFetch<PnlResult>(`/projects/${id}/pnl`),
    serverFetch<ProjectBaseline>(`/change-requests/projects/${id}/baseline`).catch(() => null),
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
