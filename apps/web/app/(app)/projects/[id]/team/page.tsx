'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
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
import type { Allocation, UserBrief } from '@/lib/types';

export default function ProjectTeamPage() {
  const { id } = useParams<{ id: string }>();
  const allocs = useQuery({
    queryKey: ['allocations', { projectId: id }],
    queryFn: () => api.get<Allocation[]>('/allocations', { query: { projectId: id } }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AllocateDialog projectId={id} />
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Engineer</TableHead>
              <TableHead className="w-32 text-right">Allocation</TableHead>
              <TableHead className="w-48">Period</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocs.isLoading && <TableEmpty colSpan={4}>Loading…</TableEmpty>}
            {allocs.data?.length === 0 && (
              <TableEmpty colSpan={4}>No allocations yet. Add one to start tracking.</TableEmpty>
            )}
            {allocs.data?.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.user.displayName}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {a.percentAllocation}%
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {formatDate(a.periodStart)} → {formatDate(a.periodEnd)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{a.notes ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const AllocSchema = z.object({
  userId: z.string().uuid('Pick a user'),
  percentAllocation: z.coerce.number().int().min(1).max(100),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});
type AllocInput = z.infer<typeof AllocSchema>;

function AllocateDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserBrief[]>('/users'),
    enabled: open,
  });
  const today = new Date().toISOString().slice(0, 10);
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const form = useForm<AllocInput>({
    resolver: zodResolver(AllocSchema),
    defaultValues: { userId: '', percentAllocation: 50, periodStart: today, periodEnd: monthEnd },
  });
  const create = useMutation({
    mutationFn: (input: AllocInput) =>
      api.post<Allocation>('/allocations', { ...input, projectId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['allocations'] });
      toast.success('Allocated');
      setOpen(false);
      form.reset({ ...form.getValues(), userId: '' });
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Allocate engineer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Allocate engineer to this project</DialogTitle>
            <DialogDescription>
              Capacity is checked — if the engineer would exceed 100% in the chosen period across
              all projects, the API rejects this allocation.
            </DialogDescription>
          </DialogHeader>
          <Field label="Engineer" error={form.formState.errors.userId?.message}>
            <Select
              value={form.watch('userId')}
              onValueChange={(v) => form.setValue('userId', v, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick an engineer…" />
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
          <div className="grid grid-cols-3 gap-3">
            <Field label="Allocation %">
              <Input type="number" min={1} max={100} {...form.register('percentAllocation')} />
            </Field>
            <Field label="From">
              <Input type="date" {...form.register('periodStart')} />
            </Field>
            <Field label="Until">
              <Input type="date" {...form.register('periodEnd')} />
            </Field>
          </div>
          <Field label="Notes">
            <Input {...form.register('notes')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Allocate'}
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
