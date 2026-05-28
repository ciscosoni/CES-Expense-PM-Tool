'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { UserBrief } from '@/lib/types';

interface PayslipLine {
  kind: 'EARNED_DAYS_EFFORT' | 'DA_EARNED' | 'REIMBURSEMENT' | 'BASE_SALARY';
  description: string;
  amount: string;
  currency: string;
  sourceKind?: string;
  sourceId?: string;
}

interface Payslip {
  userId: string;
  user: UserBrief;
  period: string;
  currency: string;
  lines: PayslipLine[];
  totals: {
    earnedDaysCost: string;
    daEarned: string;
    reimbursements: string;
    grandTotal: string;
  };
}

const KIND_LABEL: Record<PayslipLine['kind'], string> = {
  EARNED_DAYS_EFFORT: 'Effort (time logged × cost rate)',
  DA_EARNED: 'DA earned',
  REIMBURSEMENT: 'Reimbursement',
  BASE_SALARY: 'Base salary',
};

const KIND_COLOR: Record<PayslipLine['kind'], string> = {
  EARNED_DAYS_EFFORT: 'bg-blue-100 text-blue-700 border-blue-200',
  DA_EARNED: 'bg-amber-100 text-amber-700 border-amber-200',
  REIMBURSEMENT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  BASE_SALARY: 'bg-neutral-100 text-neutral-700 border-neutral-200',
};

export default function PayslipsPage() {
  const [period, setPeriod] = React.useState(currentPeriod());
  const [userId, setUserId] = React.useState<string>('');

  const users = useQuery({
    queryKey: ['payslip-users'],
    queryFn: () => api.get<UserBrief[]>('/payslips/users'),
  });

  // Auto-select the first user when the list loads.
  React.useEffect(() => {
    if (users.data && users.data.length > 0 && !userId) {
      setUserId(users.data[0]!.id);
    }
  }, [users.data, userId]);

  const payslip = useQuery({
    queryKey: ['payslip', userId, period],
    queryFn: () => api.get<Payslip>(`/payslips/${userId}`, { query: { period } }),
    enabled: !!userId,
  });

  return (
    <AdminShell
      title="Payslip Generator"
      description="Every line traces back to a source record. No mystery deductions, no recomputation in Excel."
      actions={
        <div className="flex items-end gap-2">
          <div>
            <Label>Period</Label>
            <Input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label>Employee</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Pick…" />
              </SelectTrigger>
              <SelectContent>
                {users.data?.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      }
    >
      {payslip.data && (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Effort</CardDescription>
                <CardTitle className="text-xl font-mono">
                  {formatMoney(payslip.data.totals.earnedDaysCost, payslip.data.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>DA earned</CardDescription>
                <CardTitle className="text-xl font-mono">
                  {formatMoney(payslip.data.totals.daEarned, payslip.data.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Reimbursements</CardDescription>
                <CardTitle className="text-xl font-mono">
                  {formatMoney(payslip.data.totals.reimbursements, payslip.data.currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Grand total this period</CardDescription>
                <CardTitle className="text-2xl font-mono">
                  {formatMoney(payslip.data.totals.grandTotal, payslip.data.currency)}
                </CardTitle>
              </CardHeader>
              <CardContent className="-mt-2 text-xs text-muted-foreground">
                Base salary not yet wired (Phase 2 payroll sync).
              </CardContent>
            </Card>
          </div>

          <h2 className="mb-2 text-sm font-semibold">
            Line items — tap a source ID to drill into the originating record
          </h2>
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Kind</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-32">Source</TableHead>
                  <TableHead className="text-right w-32">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslip.data.lines.length === 0 && (
                  <TableEmpty colSpan={4}>No activity in this period.</TableEmpty>
                )}
                {payslip.data.lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge className={`border ${KIND_COLOR[l.kind]}`}>{KIND_LABEL[l.kind]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{l.description}</TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">
                      {l.sourceKind ? `${l.sourceKind}/${l.sourceId?.slice(0, 8)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatMoney(l.amount, l.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Lock this period to generate a finalized payslip PDF — Phase 2 once payroll integration
            lands.
          </p>
        </>
      )}
    </AdminShell>
  );
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
