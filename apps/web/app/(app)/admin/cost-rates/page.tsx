'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { ConfirmDelete } from '@/components/admin/confirm-delete';
import { useResource } from '@/components/admin/use-resource';
import { api } from '@/lib/api';
import type { CostRate, Grade } from '@/lib/types';

const Schema = z.object({
  gradeId: z.string().uuid('Pick a grade'),
  ratePerDay: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Numeric, up to 4 decimals'),
  currency: z.string().length(3).toUpperCase().default('INR'),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
});
type Input = z.infer<typeof Schema>;
type UpdateInput = Partial<Input>;

export default function CostRatesPage() {
  const r = useResource<CostRate, Input, UpdateInput>('cost-rates');
  const grades = useQuery({
    queryKey: ['grades', { includeInactive: 'false' }],
    queryFn: () => api.get<Grade[]>('/master-data/grades'),
  });
  const gradeById = React.useMemo(() => new Map(grades.data?.map((g) => [g.id, g])), [grades.data]);

  return (
    <AdminShell
      title="Cost Rates"
      description="Time-versioned internal day cost per grade. P&L engine picks the rate effective on each log date."
      actions={
        <CreateDialog
          grades={grades.data ?? []}
          onSubmit={(v) => r.create.mutate(v)}
          pending={r.create.isPending}
        />
      }
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Grade</TableHead>
              <TableHead className="text-right w-32">Rate / day</TableHead>
              <TableHead className="w-20">Currency</TableHead>
              <TableHead className="w-36">Effective from</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.list.isLoading && <TableEmpty colSpan={5}>Loading…</TableEmpty>}
            {r.list.data?.length === 0 && <TableEmpty colSpan={5}>No cost rates yet.</TableEmpty>}
            {r.list.data?.map((c) => {
              const g = gradeById.get(c.gradeId);
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {g?.code ?? c.gradeId.slice(0, 6)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {Number(c.ratePerDay).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.currency}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {c.effectiveFrom.slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <EditDialog
                        grades={grades.data ?? []}
                        rate={c}
                        onSubmit={(input) => r.update.mutate({ id: c.id, input })}
                        pending={r.update.isPending}
                      />
                      <ConfirmDelete
                        label={`${g?.code ?? ''} @ ${c.effectiveFrom.slice(0, 10)}`}
                        onConfirm={() => r.remove.mutate(c.id)}
                        pending={r.remove.isPending}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
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

function CreateDialog({
  grades,
  onSubmit,
  pending,
}: {
  grades: Grade[];
  onSubmit: (v: Input) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<Input>({
    resolver: zodResolver(Schema),
    defaultValues: {
      gradeId: '',
      ratePerDay: '',
      currency: 'INR',
      effectiveFrom: new Date().toISOString().slice(0, 10),
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New rate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={form.handleSubmit((v) => {
            onSubmit(v);
            setOpen(false);
            form.reset();
          })}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>New cost rate</DialogTitle>
          </DialogHeader>
          <Field label="Grade" error={form.formState.errors.gradeId?.message}>
            <Select
              value={form.watch('gradeId')}
              onValueChange={(v) => form.setValue('gradeId', v, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a grade…" />
              </SelectTrigger>
              <SelectContent>
                {grades.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.code} — {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate per day" error={form.formState.errors.ratePerDay?.message}>
              <Input placeholder="8000.00" {...form.register('ratePerDay')} />
            </Field>
            <Field label="Currency">
              <Input maxLength={3} {...form.register('currency')} />
            </Field>
          </div>
          <Field label="Effective from" error={form.formState.errors.effectiveFrom?.message}>
            <Input type="date" {...form.register('effectiveFrom')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  grades,
  rate,
  onSubmit,
  pending,
}: {
  grades: Grade[];
  rate: CostRate;
  onSubmit: (v: UpdateInput) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<Input>({
    resolver: zodResolver(Schema),
    defaultValues: {
      gradeId: rate.gradeId,
      ratePerDay: rate.ratePerDay,
      currency: rate.currency,
      effectiveFrom: rate.effectiveFrom.slice(0, 10),
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o)
          form.reset({
            gradeId: rate.gradeId,
            ratePerDay: rate.ratePerDay,
            currency: rate.currency,
            effectiveFrom: rate.effectiveFrom.slice(0, 10),
          });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Edit cost rate">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={form.handleSubmit((v) => {
            onSubmit(v);
            setOpen(false);
          })}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Edit cost rate</DialogTitle>
          </DialogHeader>
          <Field label="Grade">
            <Select
              value={form.watch('gradeId')}
              onValueChange={(v) => form.setValue('gradeId', v, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {grades.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.code} — {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate per day">
              <Input {...form.register('ratePerDay')} />
            </Field>
            <Field label="Currency">
              <Input maxLength={3} {...form.register('currency')} />
            </Field>
          </div>
          <Field label="Effective from">
            <Input type="date" {...form.register('effectiveFrom')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
