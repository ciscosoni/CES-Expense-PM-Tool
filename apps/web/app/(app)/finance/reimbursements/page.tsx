'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { CreditCard } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError, api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { Reimbursement, ReimbursementEligibleGroup, ReimbursementStatus } from '@/lib/types';

const STATUS_COLOR: Record<ReimbursementStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-blue-100 text-blue-700 border-blue-200',
  PAID: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-neutral-100 text-neutral-500 border-neutral-200',
};

export default function ReimbursementsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['reimbursements'],
    queryFn: () => api.get<Reimbursement[]>('/reimbursements'),
  });
  const eligible = useQuery({
    queryKey: ['reimbursements', 'eligible'],
    queryFn: () => api.get<ReimbursementEligibleGroup[]>('/reimbursements/eligible-expenses'),
  });

  const batch = useMutation({
    mutationFn: (expenseIds: string[]) =>
      api.post<Reimbursement>('/reimbursements', { expenseIds }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reimbursements'] });
      toast.success('Batch created');
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <AdminShell
      title="Reimbursement Queue"
      description="Approved expenses are grouped by employee. Create a batch, mark paid with a bank/Tally reference — payslip lines derive from these."
    >
      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">Eligible expenses (approved, not yet paid)</h2>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right w-32"># expenses</TableHead>
                <TableHead className="text-right w-40">Total</TableHead>
                <TableHead className="w-40 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eligible.isLoading && <TableEmpty colSpan={4}>Loading…</TableEmpty>}
              {eligible.data?.length === 0 && (
                <TableEmpty colSpan={4}>Nothing eligible right now.</TableEmpty>
              )}
              {eligible.data?.map((g) => (
                <TableRow key={g.user.id}>
                  <TableCell>{g.user.displayName}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {g.expenses.length}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatMoney(g.totalAmount, g.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => batch.mutate(g.expenses.map((e) => e.id))}
                      disabled={batch.isPending}
                    >
                      Create batch
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Batches</h2>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right w-32">Total</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-44">Paid on / Reference</TableHead>
                <TableHead className="w-48 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading && <TableEmpty colSpan={5}>Loading…</TableEmpty>}
              {list.data?.length === 0 && <TableEmpty colSpan={5}>No batches yet.</TableEmpty>}
              {list.data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.user.displayName}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatMoney(r.totalAmount, r.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge className={`border ${STATUS_COLOR[r.status]}`}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.paidOn ? `${formatDate(r.paidOn)} · ${r.reference}` : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status !== 'PAID' && r.status !== 'CANCELLED' && (
                      <MarkPaidDialog id={r.id} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </AdminShell>
  );
}

const MarkPaidSchema = z.object({
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().min(1).max(80),
});
type MarkPaidInput = z.infer<typeof MarkPaidSchema>;

function MarkPaidDialog({ id }: { id: string }) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const form = useForm<MarkPaidInput>({
    resolver: zodResolver(MarkPaidSchema),
    defaultValues: { paidOn: new Date().toISOString().slice(0, 10), reference: '' },
  });
  const pay = useMutation({
    mutationFn: (input: MarkPaidInput) => api.post(`/reimbursements/${id}/mark-paid`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reimbursements'] });
      toast.success('Marked PAID; expenses are now REIMBURSED');
      setOpen(false);
      form.reset();
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CreditCard className="h-3.5 w-3.5" /> Mark paid
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit((v) => pay.mutate(v))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Mark reimbursement paid</DialogTitle>
            <DialogDescription>
              Reference is recorded against every linked expense so the payslip line later traces
              back here (Principle #3 — derivation visible end-to-end).
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Paid on</Label>
              <Input type="date" {...form.register('paidOn')} />
            </div>
            <div className="space-y-1.5">
              <Label>Reference (UTR / Tally bill #)</Label>
              <Input placeholder="UTR123456789" {...form.register('reference')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pay.isPending}>
              {pay.isPending ? 'Saving…' : 'Mark paid'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
