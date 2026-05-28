'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Clock, Plus } from 'lucide-react';
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
import { formatDate } from '@/lib/format';
import type { Task, TaskStatus, TimeLog } from '@/lib/types';

const STATUS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'];

const STATUS_COLORS: Record<TaskStatus, string> = {
  TODO: 'border border-neutral-200 bg-neutral-100 text-neutral-700',
  IN_PROGRESS: 'border border-blue-200 bg-blue-100 text-blue-700',
  BLOCKED: 'border border-amber-200 bg-amber-100 text-amber-700',
  DONE: 'border border-emerald-200 bg-emerald-100 text-emerald-700',
  CANCELLED: 'border border-neutral-200 bg-neutral-100 text-neutral-500 line-through',
};

export default function MyTasksPage() {
  const qc = useQueryClient();
  const tasks = useQuery({
    queryKey: ['tasks', 'mine'],
    queryFn: () => api.get<Task[]>('/tasks/mine'),
  });
  const recentLogs = useQuery({
    queryKey: ['time-logs', 'mine'],
    queryFn: () =>
      api.get<TimeLog[]>('/time-logs/mine', {
        query: {
          dateFrom: new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10),
        },
      }),
  });

  const updateTask = useMutation({
    mutationFn: (args: { id: string; input: Partial<Task> & Record<string, unknown> }) =>
      api.patch<Task>(`/tasks/${args.id}`, args.input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', 'mine'] });
      toast.success('Updated');
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  const totalHoursThisWeek = React.useMemo(() => {
    const monday = new Date();
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const cutoff = monday.toISOString().slice(0, 10);
    return (
      recentLogs.data
        ?.filter((l) => l.date.slice(0, 10) >= cutoff)
        .reduce((sum, l) => sum + Number(l.hours), 0) ?? 0
    );
  }, [recentLogs.data]);

  return (
    <AdminShell
      title="My Tasks"
      description={
        <span className="text-sm">
          You logged <span className="font-mono font-medium">{totalHoursThisWeek.toFixed(1)}h</span>{' '}
          this week. Daily standup auto-publishes from updates here.
        </span>
      }
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Project</TableHead>
              <TableHead>Task</TableHead>
              <TableHead className="w-36">Status</TableHead>
              <TableHead className="w-32 text-right">% complete</TableHead>
              <TableHead className="w-24 text-right">Log time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.isLoading && <TableEmpty colSpan={5}>Loading…</TableEmpty>}
            {tasks.data?.length === 0 && (
              <TableEmpty colSpan={5}>No tasks assigned to you.</TableEmpty>
            )}
            {tasks.data?.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-xs text-muted-foreground">
                  <Link href={`/projects/${t.project.id}`} className="hover:underline">
                    {t.project.code}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{t.name}</div>
                  {t.plannedEnd && (
                    <div className="text-xs text-muted-foreground">
                      due {formatDate(t.plannedEnd)}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={t.status}
                    onValueChange={(v) =>
                      updateTask.mutate({ id: t.id, input: { status: v as TaskStatus } })
                    }
                  >
                    <SelectTrigger className={`h-8 ${STATUS_COLORS[t.status]}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <input
                    type="number"
                    defaultValue={t.percentComplete}
                    min={0}
                    max={100}
                    onBlur={(e) => {
                      const v = Math.max(0, Math.min(100, Number(e.currentTarget.value)));
                      if (v !== t.percentComplete) {
                        updateTask.mutate({ id: t.id, input: { percentComplete: v } });
                      }
                    }}
                    className="ml-auto block h-8 w-20 rounded-md border border-input bg-transparent px-2 text-right font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <LogTimeDialog task={t} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold">Recent time logs (past 14 days)</h2>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Date</TableHead>
                <TableHead className="text-right w-20">Hours</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentLogs.isLoading && <TableEmpty colSpan={4}>Loading…</TableEmpty>}
              {recentLogs.data?.length === 0 && (
                <TableEmpty colSpan={4}>No time logged in the past 14 days.</TableEmpty>
              )}
              {recentLogs.data?.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{formatDate(l.date)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{l.hours}</TableCell>
                  <TableCell className="text-sm">
                    {(l as TimeLog & { task?: { name: string } }).task?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.notes ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminShell>
  );
}

const LogTimeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.coerce.number().positive().max(24),
  notes: z.string().optional(),
});
type LogTimeInput = z.infer<typeof LogTimeSchema>;

function LogTimeDialog({ task }: { task: Task }) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const form = useForm<LogTimeInput>({
    resolver: zodResolver(LogTimeSchema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      hours: 1,
      notes: '',
    },
  });
  const create = useMutation({
    mutationFn: (input: LogTimeInput) =>
      api.post<TimeLog>('/time-logs', { ...input, taskId: task.id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['time-logs'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Time logged');
      setOpen(false);
      form.reset({ date: new Date().toISOString().slice(0, 10), hours: 1, notes: '' });
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Log time">
          <Clock className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Log time</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{task.name}</span>{' '}
              <Badge variant="outline" className="ml-1 text-[10px]">
                {task.project.code}
              </Badge>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input type="date" {...form.register('date')} />
            </Field>
            <Field label="Hours">
              <Input type="number" step="0.25" min="0.25" max="24" {...form.register('hours')} />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <Input {...form.register('notes')} placeholder="What did you do?" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Log'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Plus icon kept available for future "Add task" button on this page.
void Plus;

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
