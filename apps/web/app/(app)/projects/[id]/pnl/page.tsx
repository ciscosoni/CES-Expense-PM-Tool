import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { PnlResult } from '@/lib/types';

export default async function ProjectPnlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pnl = await serverFetch<PnlResult>(`/projects/${id}/pnl`);
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
        <Card>
          <CardHeader>
            <CardDescription>Revenue</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {formatMoney(pnl.revenue.amount, ccy)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total cost</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {formatMoney(pnl.cost.amount, ccy)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Gross profit</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {formatMoney(pnl.grossProfit.amount, ccy)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Margin</CardDescription>
            <CardTitle className="text-2xl font-mono">
              {pnl.marginPercent !== null ? `${pnl.marginPercent.toFixed(2)}%` : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

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
