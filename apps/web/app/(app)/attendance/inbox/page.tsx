'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { formatDate } from '@/lib/format';
import type { AttendanceRegularization } from '@/lib/types';

export default function AttendanceInboxPage() {
  const qc = useQueryClient();
  const inbox = useQuery({
    queryKey: ['attendance', 'regularizations', 'inbox'],
    queryFn: () => api.get<AttendanceRegularization[]>('/attendance/regularizations/inbox'),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/attendance/regularizations/${id}/approve`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['attendance'] });
      toast.success('Approved');
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <AdminShell
      title="Regularization queue"
      description="Engineer-submitted overrides to their attendance day. Approve when GPS got it wrong; reject if it didn't."
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Engineer</TableHead>
              <TableHead className="w-28">Date</TableHead>
              <TableHead className="w-44">Reason</TableHead>
              <TableHead>Justification · Project</TableHead>
              <TableHead className="w-48 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inbox.isLoading && <TableEmpty colSpan={5}>Loading…</TableEmpty>}
            {inbox.data?.length === 0 && (
              <TableEmpty colSpan={5}>Inbox zero — no regularizations waiting.</TableEmpty>
            )}
            {inbox.data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-sm">{r.user.displayName}</TableCell>
                <TableCell className="font-mono text-xs">{formatDate(r.date)}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className="text-[10px]">
                    {r.reason.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{r.notes}</p>
                  {r.project && (
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {r.project.code} — {r.project.name}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>
                      Approve
                    </Button>
                    <RejectDialog id={r.id} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        <Badge variant="outline" className="mr-1 text-[9px]">
          POLICY
        </Badge>
        Approval flips the day's status to REGULARIZED with the engineer's reason. Rejects require a
        reason and are visible to the submitter.
      </p>
    </AdminShell>
  );
}

const RejectSchema = z.object({ reason: z.string().min(1, 'Required').max(500) });
type RejectInput = z.infer<typeof RejectSchema>;

function RejectDialog({ id }: { id: string }) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const form = useForm<RejectInput>({
    resolver: zodResolver(RejectSchema),
    defaultValues: { reason: '' },
  });
  const reject = useMutation({
    mutationFn: (input: RejectInput) =>
      api.post(`/attendance/regularizations/${id}/reject`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['attendance'] });
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
            <DialogTitle>Reject regularization</DialogTitle>
            <DialogDescription>
              Reason is required, audited, and visible to the engineer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input
              placeholder="e.g. WhatsApp message confirms you weren't on site that day."
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
