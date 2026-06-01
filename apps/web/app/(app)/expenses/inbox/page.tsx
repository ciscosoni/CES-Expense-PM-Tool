'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
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
import { Sparkles } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { Expense } from '@/lib/types';

interface AutoApproveSuggestion {
  expenseId: string;
  reasons: string[];
}

export default function ExpensesInboxPage() {
  const qc = useQueryClient();
  const inbox = useQuery({
    queryKey: ['expenses', 'inbox'],
    queryFn: () => api.get<Expense[]>('/expenses/inbox'),
  });
  // Suggest-only auto-approval: which queued expenses pass the clean-expense policy.
  const suggestions = useQuery({
    queryKey: ['expenses', 'auto-approvable'],
    queryFn: () =>
      api.get<{ suggestions: AutoApproveSuggestion[] }>('/agents/auto-approval/suggestions'),
  });
  const autoMap = React.useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of suggestions.data?.suggestions ?? []) m.set(s.expenseId, s.reasons);
    return m;
  }, [suggestions.data]);

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/expenses/${id}/approve`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Approved');
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <AdminShell
      title="Expense Inbox"
      description="Expenses awaiting your approval. Rejects require a reason."
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Submitter</TableHead>
              <TableHead className="w-28">Incurred</TableHead>
              <TableHead className="w-32">Category</TableHead>
              <TableHead>Project · Notes</TableHead>
              <TableHead className="text-right w-32">Amount</TableHead>
              <TableHead className="w-48 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inbox.isLoading && <TableEmpty colSpan={6}>Loading…</TableEmpty>}
            {inbox.data?.length === 0 && (
              <TableEmpty colSpan={6}>Inbox zero — nothing waiting on you.</TableEmpty>
            )}
            {inbox.data?.map((e) => {
              const reasons = autoMap.get(e.id);
              const clean = !!reasons;
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">{e.user.displayName}</TableCell>
                  <TableCell className="font-mono text-xs">{formatDate(e.incurredOn)}</TableCell>
                  <TableCell className="text-xs">{e.category.replace(/_/g, ' ')}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{e.project.code}</span>
                      {clean && (
                        <span
                          title={`Passes the auto-approval policy: ${reasons.join('; ')}`}
                          className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--ai-via)/0.4)] bg-[hsl(var(--ai-via)/0.08)] px-1.5 py-0.5 text-[10px] font-medium ai-gradient-text"
                        >
                          <Sparkles className="h-3 w-3 text-[hsl(var(--ai-via))]" />
                          Auto-approvable
                        </span>
                      )}
                    </div>
                    {e.notes && <div className="text-sm">{e.notes}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatMoney(e.amount, e.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant={clean ? 'ai' : 'default'}
                        onClick={() => approve.mutate(e.id)}
                        disabled={approve.isPending}
                      >
                        Approve
                      </Button>
                      <RejectExpenseDialog id={e.id} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        <Badge variant="outline" className="mr-1 text-[9px]">
          POLICY
        </Badge>
        PMs approve expenses on their projects; FINANCE + ADMIN can approve any. Every action writes
        to the audit log.
      </p>
    </AdminShell>
  );
}

const RejectSchema = z.object({ reason: z.string().min(1, 'Required').max(500) });
type RejectInput = z.infer<typeof RejectSchema>;

function RejectExpenseDialog({ id }: { id: string }) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const form = useForm<RejectInput>({
    resolver: zodResolver(RejectSchema),
    defaultValues: { reason: '' },
  });
  const reject = useMutation({
    mutationFn: (input: RejectInput) => api.post(`/expenses/${id}/reject`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Rejected');
      setOpen(false);
      form.reset();
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit((v) => reject.mutate(v))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Reject expense</DialogTitle>
            <DialogDescription>
              Reason is required, audited, and visible to the submitter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input
              placeholder="e.g. Duplicate of EXP-1234, or over policy cap."
              {...form.register('reason')}
            />
            {form.formState.errors.reason && (
              <p className="text-xs text-destructive">{form.formState.errors.reason.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={reject.isPending}>
              {reject.isPending ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
