import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { formatMoney } from '@/lib/format';

interface WorklistRow {
  id: string;
  code: string;
  name: string;
  status: string;
  issue: 'MISSING' | 'PLACEHOLDER';
  contractValue: string;
  contractCurrency: string;
  cost: string;
}

export default async function BudgetWorklistPage() {
  const rows = await serverFetch<WorklistRow[]>('/dashboards/budget-worklist').catch(
    () => [] as WorklistRow[],
  );
  const missing = rows.filter((r) => r.issue === 'MISSING');
  const placeholder = rows.filter((r) => r.issue === 'PLACEHOLDER');

  return (
    <AdminShell
      title="Budget worklist"
      description="Projects whose budget is unreliable, so their P&L margin can't be trusted yet. Set a real contract value on each to clear its banner and feed accurate portfolio margin."
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{missing.length}</p>
              <p className="text-xs text-muted-foreground">No contract value (revenue = 0)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{placeholder.length}</p>
              <p className="text-xs text-muted-foreground">
                Placeholder budget (seeded at break-even)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Current budget</TableHead>
                <TableHead className="text-right">Cost to date</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableEmpty colSpan={6}>
                  No projects need attention — every budget is real. 🎉
                </TableEmpty>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.code}</div>
                    <div className="max-w-[28ch] truncate text-xs text-muted-foreground">
                      {r.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.issue === 'MISSING' ? (
                      <Badge variant="destructive">No budget</Badge>
                    ) : (
                      <Badge variant="warning">Placeholder</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.status}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {Number(r.contractValue) > 0
                      ? formatMoney(r.contractValue, r.contractCurrency)
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatMoney(r.cost, r.contractCurrency)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/projects/${r.id}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          &ldquo;Cost to date&rdquo; is the floor a real contract value must clear to show a positive
          margin. Placeholders were seeded at break-even (budget = cost) because Workway carried no
          contract value.
        </p>
      )}
    </AdminShell>
  );
}
