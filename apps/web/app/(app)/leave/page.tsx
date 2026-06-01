'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface Leave {
  id: string;
  date: string;
  durationDays: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason: string | null;
  user?: { displayName: string };
  leaveType?: { name: string; paid: boolean } | null;
}

const TONE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
  CANCELLED: 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

export default function LeavePage() {
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: ['leave', 'mine'], queryFn: () => api.get<Leave[]>('/leave/mine') });
  const inbox = useQuery({ queryKey: ['leave', 'inbox'], queryFn: () => api.get<Leave[]>('/leave/inbox').catch(() => [] as Leave[]) });
  const holidays = useQuery({ queryKey: ['holidays'], queryFn: () => api.get<{ id: string; name: string; date: string }[]>('/holidays') });

  const [date, setDate] = React.useState('');
  const [reason, setReason] = React.useState('');
  const request = useMutation({
    mutationFn: () => api.post('/leave', { date, reason: reason || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leave'] });
      toast.success('Leave requested');
      setDate('');
      setReason('');
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api.post(`/leave/${id}/${approve ? 'approve' : 'reject'}`, approve ? {} : { reason: 'Rejected' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leave'] });
      toast.success('Done');
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });

  return (
    <AdminShell title="Leave" description="Request time off and track approvals. Holidays are company-wide.">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (date) request.mutate();
            }}
            className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
          >
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Personal" />
            </div>
            <Button type="submit" disabled={!date || request.isPending}>
              Request leave
            </Button>
          </form>

          {(inbox.data?.length ?? 0) > 0 && (
            <div className="rounded-md border bg-card">
              <p className="border-b px-4 py-2 text-sm font-semibold">Pending approvals ({inbox.data!.length})</p>
              <Table>
                <TableBody>
                  {inbox.data!.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">{l.user?.displayName}</TableCell>
                      <TableCell className="font-mono text-xs">{formatDate(l.date)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.reason ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => decide.mutate({ id: l.id, approve: true })}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: l.id, approve: false })}>Reject</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="rounded-md border bg-card">
            <p className="border-b px-4 py-2 text-sm font-semibold">My leave</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Date</TableHead>
                  <TableHead className="w-24">Duration</TableHead>
                  <TableHead>Type · Reason</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.isLoading && <TableEmpty colSpan={4}>Loading…</TableEmpty>}
                {mine.data?.length === 0 && <TableEmpty colSpan={4}>No leave yet.</TableEmpty>}
                {mine.data?.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{formatDate(l.date)}</TableCell>
                    <TableCell className="text-xs">{Number(l.durationDays) === 0.5 ? 'Half day' : '1 day'}</TableCell>
                    <TableCell className="text-sm">
                      {l.leaveType?.name ?? '—'}
                      {l.reason ? ` · ${l.reason}` : ''}
                    </TableCell>
                    <TableCell>
                      <Badge className={`border ${TONE[l.status]}`}>{l.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-md border bg-card">
          <p className="border-b px-4 py-2 text-sm font-semibold">Holidays</p>
          <ul className="max-h-[28rem] divide-y overflow-y-auto text-sm">
            {holidays.data?.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-2">
                <span>{h.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{formatDate(h.date)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AdminShell>
  );
}
