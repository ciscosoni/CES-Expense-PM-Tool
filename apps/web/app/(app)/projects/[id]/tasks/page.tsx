'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
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
import type { Task, TaskStatus, UserBrief } from '@/lib/types';

const STATUS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];

export default function ProjectTasksPage() {
  const { id } = useParams<{ id: string }>();
  const tasks = useQuery({
    queryKey: ['tasks', { projectId: id }],
    queryFn: () => api.get<Task[]>('/tasks', { query: { projectId: id } }),
  });
  const qc = useQueryClient();

  const updateTask = useMutation({
    mutationFn: (args: { id: string; input: Partial<Task> & Record<string, unknown> }) =>
      api.patch<Task>(`/tasks/${args.id}`, args.input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task updated');
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateTaskDialog projectId={id} />
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-48">Assignee</TableHead>
              <TableHead className="w-40">Status</TableHead>
              <TableHead className="w-32 text-right">% complete</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.isLoading && <TableEmpty colSpan={4}>Loading…</TableEmpty>}
            {tasks.data?.length === 0 && <TableEmpty colSpan={4}>No tasks yet.</TableEmpty>}
            {tasks.data?.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {t.assignee?.displayName ?? '—'}
                </TableCell>
                <TableCell>
                  <Select
                    value={t.status}
                    onValueChange={(v) =>
                      updateTask.mutate({ id: t.id, input: { status: v as TaskStatus } })
                    }
                  >
                    <SelectTrigger className="h-8">
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const CreateTaskSchema = z.object({
  name: z.string().min(1).max(200),
  assigneeId: z
    .string()
    .uuid()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v)),
  status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']).default('TODO'),
  percentComplete: z.coerce.number().int().min(0).max(100).default(0),
  plannedStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v)),
  plannedEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v)),
});
type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

function CreateTaskDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserBrief[]>('/users'),
    enabled: open,
  });
  const form = useForm<CreateTaskInput>({
    resolver: zodResolver(CreateTaskSchema),
    defaultValues: {
      name: '',
      assigneeId: '',
      status: 'TODO',
      percentComplete: 0,
      plannedStart: '',
      plannedEnd: '',
    },
  });
  const create = useMutation({
    mutationFn: (input: CreateTaskInput) => api.post<Task>('/tasks', { ...input, projectId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task created');
      setOpen(false);
      form.reset();
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
          </DialogHeader>
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input {...form.register('name')} />
          </Field>
          <Field label="Assignee (optional)">
            <Select
              value={form.watch('assigneeId') ?? ''}
              onValueChange={(v) =>
                form.setValue('assigneeId', v as unknown as CreateTaskInput['assigneeId'])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {users.data?.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Planned start">
              <Input type="date" {...form.register('plannedStart')} />
            </Field>
            <Field label="Planned end">
              <Input type="date" {...form.register('plannedEnd')} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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

// Re-render note: `import { Badge }` is intentionally not consumed in this file but kept
// available for status pills as we grow the columns. Strip if linter complains.
void Badge;
