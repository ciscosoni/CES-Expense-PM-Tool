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
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { TravelRequest } from '@/lib/types';

export default function TravelInboxPage() {
  const qc = useQueryClient();
  const inbox = useQuery({
    queryKey: ['travel-requests', 'inbox'],
    queryFn: () => api.get<TravelRequest[]>('/travel-requests/inbox'),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/travel-requests/${id}/approve`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['travel-requests'] });
      toast.success('Approved');
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <AdminShell
      title="Travel — Approval Inbox"
      description="Requests on projects you manage. Rejects require a reason — no silent denials per the design constitution."
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Requester</TableHead>
              <TableHead>Project · Route · Purpose</TableHead>
              <TableHead className="w-40">Dates</TableHead>
              <TableHead className="w-40">Submitted</TableHead>
              <TableHead className="w-56 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inbox.isLoading && <TableEmpty colSpan={5}>Loading…</TableEmpty>}
            {inbox.data?.length === 0 && (
              <TableEmpty colSpan={5}>Inbox zero — nothing waiting on you.</TableEmpty>
            )}
            {inbox.data?.map((tr) => (
              <TableRow key={tr.id}>
                <TableCell>{tr.user.displayName}</TableCell>
                <TableCell>
                  <div className="text-xs text-muted-foreground">{tr.project.code}</div>
                  <div className="text-sm">
                    {tr.fromCity.name} → {tr.toCity.name}{' '}
                    <Badge variant="outline" className="ml-1 text-[10px]">
                      {tr.travelClass.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{tr.purpose}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {formatDate(tr.startDate)} → {formatDate(tr.endDate)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {tr.createdAt && new Date(tr.createdAt).toLocaleString('en-IN')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => approve.mutate(tr.id)}
                      disabled={approve.isPending}
                    >
                      Approve
                    </Button>
                    <RejectDialog trId={tr.id} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}

const RejectSchema = z.object({
  reason: z.string().min(1, 'Required').max(500),
});
type RejectInput = z.infer<typeof RejectSchema>;

function RejectDialog({ trId }: { trId: string }) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const form = useForm<RejectInput>({
    resolver: zodResolver(RejectSchema),
    defaultValues: { reason: '' },
  });
  const reject = useMutation({
    mutationFn: (input: RejectInput) => api.post(`/travel-requests/${trId}/reject`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['travel-requests'] });
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
            <DialogTitle>Reject travel request</DialogTitle>
            <DialogDescription>
              A reason is required and recorded on the audit log — visible to the requester.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input
              placeholder="e.g. Site already covered by another engineer this week."
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
