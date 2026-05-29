'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { CalendarDays, MapPin, Plus, ShieldAlert, type LucideIcon } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
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
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type {
  AttendanceDay,
  AttendanceDayStatus,
  AttendanceRegularization,
  ProjectRow,
  RegularizationReason,
} from '@/lib/types';

export default function AttendancePage() {
  const days = useQuery({
    queryKey: ['attendance', 'mine'],
    queryFn: () => api.get<AttendanceDay[]>('/attendance/mine'),
  });
  const myRegs = useQuery({
    queryKey: ['attendance', 'mine', 'regularizations'],
    queryFn: () => api.get<AttendanceRegularization[]>('/attendance/regularizations/mine'),
  });

  const onSiteDays = days.data?.filter((d) => d.status === 'ON_SITE').length ?? 0;
  const remoteDays = days.data?.filter((d) => d.status === 'REMOTE').length ?? 0;
  const regularizedDays = days.data?.filter((d) => d.status === 'REGULARIZED').length ?? 0;
  const openRegs = myRegs.data?.filter((r) => r.status === 'SUBMITTED').length ?? 0;

  return (
    <AdminShell
      title="Attendance"
      description="Your derived attendance, day by day. Every status shows its derivation. If the GPS got it wrong, request a regularize."
    >
      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <KpiCard icon={CalendarDays} label="On-site days" value={String(onSiteDays)} hint="Last 90d" />
        <KpiCard icon={MapPin} label="Remote days" value={String(remoteDays)} hint="Last 90d" />
        <KpiCard
          icon={ShieldAlert}
          label="Regularized"
          value={String(regularizedDays)}
          hint="Approved overrides"
        />
        <KpiCard icon={Plus} label="Open requests" value={String(openRegs)} hint="Waiting decision" />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Last 90 days</h2>
        <RegularizeDialog />
      </div>

      <div className="rounded-md border bg-card">
        <ul className="divide-y divide-border/70">
          {days.isLoading && <li className="p-4 text-xs text-muted-foreground">Loading…</li>}
          {days.data?.length === 0 && (
            <li className="p-6 text-center text-xs text-muted-foreground">
              No attendance records yet. Punch in from the mobile app to start your trail.
            </li>
          )}
          {days.data?.map((d) => (
            <li key={d.id} className="flex items-start gap-4 p-3">
              <div className="w-24 shrink-0">
                <p className="font-mono text-xs text-muted-foreground">{formatDate(d.date)}</p>
                <p className="text-xs">{weekdayShort(d.date)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <StatusBadge status={d.status} />
                  <span className="text-xs text-muted-foreground">
                    {d.onSiteMinutes > 0 ? `${humanMinutes(d.onSiteMinutes)} on-site` : '—'}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    {d.eventCount} event{d.eventCount === 1 ? '' : 's'}
                  </span>
                </div>
                {d.derivationNote && (
                  <p className="mt-1 text-xs text-muted-foreground">{d.derivationNote}</p>
                )}
                {d.regularization && (
                  <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                    Regularized by {d.regularization.approver?.displayName ?? '—'} on{' '}
                    {formatDate(d.regularization.decidedAt ?? '')} —{' '}
                    {d.regularization.reason.replace(/_/g, ' ').toLowerCase()}
                  </p>
                )}
              </div>
              <RegularizeDialog defaultDate={d.date} variant="ghost" />
            </li>
          ))}
        </ul>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold">My regularization requests</h2>
      <div className="rounded-md border bg-card">
        <ul className="divide-y divide-border/70">
          {myRegs.isLoading && <li className="p-4 text-xs text-muted-foreground">Loading…</li>}
          {myRegs.data?.length === 0 && (
            <li className="p-6 text-center text-xs text-muted-foreground">
              No regularizations yet.
            </li>
          )}
          {myRegs.data?.map((r) => (
            <li key={r.id} className="flex items-start gap-4 p-3">
              <div className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                {formatDate(r.date)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <RegStatusBadge status={r.status} />
                  <span className="text-xs text-muted-foreground">
                    {r.reason.replace(/_/g, ' ').toLowerCase()}
                  </span>
                  {r.project && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                      {r.project.code}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm">{r.notes}</p>
                {r.rejectReason && (
                  <p className="mt-1 text-[11px] text-destructive">Rejected: {r.rejectReason}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AdminShell>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <CardDescription>{label}</CardDescription>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="font-mono text-2xl font-semibold">{value}</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: AttendanceDayStatus }) {
  const map: Record<AttendanceDayStatus, { label: string; cls: string }> = {
    ON_SITE: { label: 'On-site', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
    REMOTE: { label: 'Remote', cls: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
    PARTIAL: { label: 'Partial', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
    ABSENT: { label: 'Absent', cls: 'bg-red-500/15 text-red-600 border-red-500/30' },
    REGULARIZED: {
      label: 'Regularized',
      cls: 'bg-violet-500/15 text-violet-600 border-violet-500/30',
    },
  };
  const m = map[status];
  return <Badge className={`border text-[10px] ${m.cls}`}>{m.label}</Badge>;
}

function RegStatusBadge({ status }: { status: AttendanceRegularization['status'] }) {
  const map = {
    SUBMITTED: { label: 'Pending', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
    APPROVED: { label: 'Approved', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
    REJECTED: { label: 'Rejected', cls: 'bg-red-500/15 text-red-600 border-red-500/30' },
    CANCELLED: {
      label: 'Cancelled',
      cls: 'bg-neutral-500/15 text-neutral-500 border-neutral-500/30',
    },
  } as const;
  const m = map[status];
  return <Badge className={`border text-[10px] ${m.cls}`}>{m.label}</Badge>;
}

const RegularizeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  reason: z.enum([
    'REMOTE_WORK',
    'MISSED_PUNCH',
    'SITE_VISIT_NOT_GEOFENCED',
    'SICK',
    'PERSONAL',
    'OTHER',
  ]) satisfies z.ZodType<RegularizationReason>,
  notes: z.string().min(1, 'Justification is required').max(500),
  projectId: z.string().uuid().nullable().default(null),
});
type RegularizeInput = z.infer<typeof RegularizeSchema>;

function RegularizeDialog({
  defaultDate,
  variant = 'default',
}: {
  defaultDate?: string;
  variant?: 'default' | 'ghost';
}) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const projects = useQuery({
    queryKey: ['projects', 'lookup'],
    queryFn: () => api.get<ProjectRow[]>('/projects'),
    enabled: open,
  });

  const form = useForm<RegularizeInput>({
    resolver: zodResolver(RegularizeSchema),
    defaultValues: {
      date: defaultDate ? defaultDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      reason: 'REMOTE_WORK',
      notes: '',
      projectId: null,
    },
  });

  const submit = useMutation({
    mutationFn: (input: RegularizeInput) => api.post('/attendance/regularizations', input),
    onSuccess: () => {
      toast.success('Regularization submitted');
      setOpen(false);
      form.reset();
      void qc.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant === 'ghost' ? 'ghost' : 'default'}>
          {variant === 'ghost' ? 'Regularize' : (
            <>
              <Plus className="h-3.5 w-3.5" /> New regularize
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <form onSubmit={form.handleSubmit((v) => submit.mutate(v))} className="space-y-3">
          <DialogHeader>
            <DialogTitle>Regularize a day</DialogTitle>
            <DialogDescription>
              Override the system's derived status. Approval is required and audited.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Date</Label>
              <Input type="date" {...form.register('date')} />
              {form.formState.errors.date && (
                <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>
              )}
            </div>
            <div>
              <Label>Reason</Label>
              <Select
                value={form.watch('reason')}
                onValueChange={(v) => form.setValue('reason', v as RegularizationReason)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REMOTE_WORK">Remote work</SelectItem>
                  <SelectItem value="MISSED_PUNCH">Missed punch</SelectItem>
                  <SelectItem value="SITE_VISIT_NOT_GEOFENCED">
                    Site visit (no geofence)
                  </SelectItem>
                  <SelectItem value="SICK">Sick</SelectItem>
                  <SelectItem value="PERSONAL">Personal</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Project (optional)</Label>
            <Select
              value={form.watch('projectId') ?? ''}
              onValueChange={(v) => form.setValue('projectId', v === '' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Not pinned to a project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {projects.data?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Justification</Label>
            <Textarea
              rows={3}
              placeholder="e.g. On-site at customer office in Lower Parel — no geofence configured for this location."
              {...form.register('notes')}
            />
            {form.formState.errors.notes && (
              <p className="text-xs text-destructive">{form.formState.errors.notes.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function humanMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${r}m`;
}

function weekdayShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { weekday: 'short' });
}
