'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
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
import { ApiError, api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { CommentsThread } from '@/components/comments-thread';
import type { ChangeRequest, ChangeRequestStatus, ChangeRequestType } from '@/lib/types';

export default function ProjectChangeRequestsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const list = useQuery({
    queryKey: ['change-requests', projectId],
    queryFn: () => api.get<ChangeRequest[]>('/change-requests', { query: { projectId } }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Change requests</h2>
          <p className="text-sm text-muted-foreground">
            Every scope/time/cost change runs through here. Approval applies the delta to the
            project and snapshots it for the P&amp;L baseline-vs-current view.
          </p>
        </div>
        <NewCRDialog projectId={projectId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Open + history</CardTitle>
          <CardDescription>Newest first; SUBMITTED items float to the top.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Code</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-20">Type</TableHead>
                <TableHead className="text-right w-32">Δ Contract</TableHead>
                <TableHead className="text-right w-32">Δ Budget</TableHead>
                <TableHead className="text-right w-20">Δ Days</TableHead>
                <TableHead className="w-44 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading && <TableEmpty colSpan={8}>Loading…</TableEmpty>}
              {list.data?.length === 0 && (
                <TableEmpty colSpan={8}>No change requests yet for this project.</TableEmpty>
              )}
              {list.data?.map((cr) => (
                <TableRow key={cr.id}>
                  <TableCell className="font-mono text-xs">{cr.code}</TableCell>
                  <TableCell>
                    <StatusBadge status={cr.status} />
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{cr.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {cr.createdBy.displayName} · {formatDate(cr.createdAt, 'long')}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {cr.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {cr.contractValueDelta ? signed(cr.contractValueDelta, 'INR') : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {cr.budgetDelta ? signed(cr.budgetDelta, 'INR') : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {cr.daysDelta ? `${cr.daysDelta > 0 ? '+' : ''}${cr.daysDelta}` : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <CRActions cr={cr} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: ChangeRequestStatus }) {
  const map: Record<ChangeRequestStatus, string> = {
    DRAFT: 'bg-neutral-500/15 text-neutral-500 border-neutral-500/30',
    SUBMITTED: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    APPROVED: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    REJECTED: 'bg-red-500/15 text-red-600 border-red-500/30',
    WITHDRAWN: 'bg-neutral-500/15 text-neutral-500 border-neutral-500/30',
  };
  return <Badge className={`border text-[10px] ${map[status]}`}>{status}</Badge>;
}

function CRActions({ cr }: { cr: ChangeRequest }) {
  const qc = useQueryClient();
  const submit = useMutation({
    mutationFn: () => api.post(`/change-requests/${cr.id}/submit`),
    onSuccess: () => {
      toast.success('Submitted for Owner decision');
      void qc.invalidateQueries({ queryKey: ['change-requests'] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });
  const approve = useMutation({
    mutationFn: () => api.post(`/change-requests/${cr.id}/approve`),
    onSuccess: () => {
      toast.success('Approved — deltas applied to project');
      void qc.invalidateQueries({ queryKey: ['change-requests'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });

  return (
    <div className="flex justify-end gap-2">
      {cr.status === 'DRAFT' && (
        <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending}>
          Submit
        </Button>
      )}
      {cr.status === 'SUBMITTED' && (
        <>
          <Button size="sm" onClick={() => approve.mutate()} disabled={approve.isPending}>
            Approve
          </Button>
          <RejectDialog id={cr.id} />
        </>
      )}
      <CRDetail cr={cr} />
    </div>
  );
}

function CRDetail({ cr }: { cr: ChangeRequest }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {cr.code} · {cr.title}
          </DialogTitle>
          <DialogDescription>
            Authored by {cr.createdBy.displayName}
            {cr.approver && ` · Decided by ${cr.approver.displayName}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Field label="Reason">{cr.reason}</Field>
          {cr.scopeDelta && <Field label="Scope delta">{cr.scopeDelta}</Field>}
          {cr.rejectReason && (
            <Field label="Reject reason">
              <span className="text-destructive">{cr.rejectReason}</span>
            </Field>
          )}
        </div>
        <CommentsThread entityKind="CHANGE_REQUEST" entityId={cr.id} title="CR discussion" />
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p>{children}</p>
    </div>
  );
}

function signed(amount: string, currency: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return formatMoney('0', currency);
  return `${n > 0 ? '+' : ''}${formatMoney(amount, currency)}`;
}

const NewCRSchema = z.object({
  title: z.string().min(3).max(160),
  type: z.enum(['SCOPE', 'TIME', 'COST', 'MIXED']) satisfies z.ZodType<ChangeRequestType>,
  reason: z.string().min(3).max(2000),
  contractValueDelta: z.string().regex(/^-?\d+(\.\d{1,4})?$/).optional().or(z.literal('')),
  budgetDelta: z.string().regex(/^-?\d+(\.\d{1,4})?$/).optional().or(z.literal('')),
  daysDelta: z.string().regex(/^-?\d+$/).optional().or(z.literal('')),
  scopeDelta: z.string().max(2000).optional(),
});
type NewCRInput = z.infer<typeof NewCRSchema>;

function NewCRDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const form = useForm<NewCRInput>({
    resolver: zodResolver(NewCRSchema),
    defaultValues: {
      title: '',
      type: 'MIXED',
      reason: '',
      contractValueDelta: '',
      budgetDelta: '',
      daysDelta: '',
      scopeDelta: '',
    },
  });

  const create = useMutation({
    mutationFn: (input: NewCRInput) =>
      api.post('/change-requests', {
        projectId,
        title: input.title,
        type: input.type,
        reason: input.reason,
        contractValueDelta: input.contractValueDelta || null,
        budgetDelta: input.budgetDelta || null,
        daysDelta: input.daysDelta ? Number(input.daysDelta) : null,
        scopeDelta: input.scopeDelta || null,
      }),
    onSuccess: () => {
      toast.success('Draft created');
      setOpen(false);
      form.reset();
      void qc.invalidateQueries({ queryKey: ['change-requests'] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" /> New change request
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-3">
          <DialogHeader>
            <DialogTitle>New change request</DialogTitle>
            <DialogDescription>
              Creates a draft. Submit it when ready — Owner decides.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Title</Label>
            <Input
              placeholder="e.g. Add HA pair for Mumbai DC spine"
              {...form.register('title')}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Type</Label>
              <Select
                value={form.watch('type')}
                onValueChange={(v) => form.setValue('type', v as ChangeRequestType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCOPE">Scope</SelectItem>
                  <SelectItem value="TIME">Time</SelectItem>
                  <SelectItem value="COST">Cost</SelectItem>
                  <SelectItem value="MIXED">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Days delta</Label>
              <Input placeholder="e.g. 21 or -7" {...form.register('daysDelta')} />
            </div>
            <div>
              <Label>Contract value delta</Label>
              <Input placeholder="e.g. 450000" {...form.register('contractValueDelta')} />
            </div>
            <div>
              <Label>Budget delta</Label>
              <Input placeholder="e.g. 60000" {...form.register('budgetDelta')} />
            </div>
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea
              rows={2}
              placeholder="Why this change is needed."
              {...form.register('reason')}
            />
          </div>
          <div>
            <Label>Scope delta (optional)</Label>
            <Textarea
              rows={2}
              placeholder="What's being added or removed in plain English."
              {...form.register('scopeDelta')}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const RejectSchema = z.object({ reason: z.string().min(1).max(500) });
type RejectInput = z.infer<typeof RejectSchema>;

function RejectDialog({ id }: { id: string }) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const form = useForm<RejectInput>({
    resolver: zodResolver(RejectSchema),
    defaultValues: { reason: '' },
  });
  const reject = useMutation({
    mutationFn: (input: RejectInput) => api.post(`/change-requests/${id}/reject`, input),
    onSuccess: () => {
      toast.success('Rejected');
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['change-requests'] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit((v) => reject.mutate(v))} className="space-y-3">
          <DialogHeader>
            <DialogTitle>Reject change request</DialogTitle>
            <DialogDescription>Reason is required and audited.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Why this CR isn't acceptable." {...form.register('reason')} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={reject.isPending}>
              Reject
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
