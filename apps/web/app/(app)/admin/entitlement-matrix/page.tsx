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
import type { CityTier, EntitlementRow, Grade, TravelClass } from '@/lib/types';

const TIERS: CityTier[] = ['METRO', 'TIER_2', 'TIER_3', 'INTERNATIONAL'];
const CLASSES: TravelClass[] = [
  'FLIGHT_ECONOMY',
  'FLIGHT_BUSINESS',
  'TRAIN_3AC',
  'TRAIN_2AC',
  'TRAIN_1AC',
  'BUS_AC',
  'TAXI',
];

const decimal = z.string().regex(/^\d+(\.\d{1,4})?$/, 'Numeric, up to 4 decimals');
const currency = z.string().length(3).toUpperCase().default('INR');

const Schema = z.object({
  gradeId: z.string().uuid('Pick a grade'),
  cityTier: z.enum(['METRO', 'TIER_2', 'TIER_3', 'INTERNATIONAL']),
  perDiemAmount: decimal,
  perDiemCurrency: currency,
  lodgingCapPerNight: decimal,
  lodgingCurrency: currency,
  travelClass: z.enum([
    'FLIGHT_ECONOMY',
    'FLIGHT_BUSINESS',
    'TRAIN_3AC',
    'TRAIN_2AC',
    'TRAIN_1AC',
    'BUS_AC',
    'TAXI',
  ]),
  localConveyanceCapPerDay: decimal,
  localConveyanceCurrency: currency,
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
});
type Input = z.infer<typeof Schema>;
type UpdateInput = Partial<Input>;

export default function EntitlementMatrixPage() {
  const r = useResource<EntitlementRow, Input, UpdateInput>('entitlement-matrix');
  const grades = useQuery({
    queryKey: ['grades'],
    queryFn: () => api.get<Grade[]>('/master-data/grades'),
  });
  const gradeById = React.useMemo(() => new Map(grades.data?.map((g) => [g.id, g])), [grades.data]);

  return (
    <AdminShell
      title="Entitlement Matrix"
      description="Per-diem, lodging cap, travel class, local conveyance — keyed by grade × city tier, time-versioned."
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
              <TableHead className="w-20">Grade</TableHead>
              <TableHead className="w-28">Tier</TableHead>
              <TableHead className="text-right w-28">Per diem</TableHead>
              <TableHead className="text-right w-28">Lodging cap</TableHead>
              <TableHead className="w-36">Travel class</TableHead>
              <TableHead className="text-right w-28">Local conv.</TableHead>
              <TableHead className="w-32">Effective</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.list.isLoading && <TableEmpty colSpan={8}>Loading…</TableEmpty>}
            {r.list.data?.length === 0 && <TableEmpty colSpan={8}>No matrix rows yet.</TableEmpty>}
            {r.list.data?.map((e) => {
              const g = gradeById.get(e.gradeId);
              return (
                <TableRow key={e.id}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {g?.code ?? '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{e.cityTier}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {e.perDiemCurrency} {Number(e.perDiemAmount).toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {e.lodgingCurrency} {Number(e.lodgingCapPerNight).toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell className="text-xs">{e.travelClass}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {e.localConveyanceCurrency}{' '}
                    {Number(e.localConveyanceCapPerDay).toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.effectiveFrom.slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <EditDialog
                        grades={grades.data ?? []}
                        row={e}
                        onSubmit={(input) => r.update.mutate({ id: e.id, input })}
                        pending={r.update.isPending}
                      />
                      <ConfirmDelete
                        label={`${g?.code ?? ''} × ${e.cityTier}`}
                        onConfirm={() => r.remove.mutate(e.id)}
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

function FormBody({ form }: { form: ReturnType<typeof useForm<Input>> }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City tier">
          <Select
            value={form.watch('cityTier')}
            onValueChange={(v) => form.setValue('cityTier', v as CityTier, { shouldDirty: true })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIERS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Travel class">
          <Select
            value={form.watch('travelClass')}
            onValueChange={(v) =>
              form.setValue('travelClass', v as TravelClass, { shouldDirty: true })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLASSES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Per diem" error={form.formState.errors.perDiemAmount?.message}>
          <Input placeholder="1500.00" {...form.register('perDiemAmount')} />
        </Field>
        <Field label="Per-diem currency">
          <Input maxLength={3} {...form.register('perDiemCurrency')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Lodging cap / night"
          error={form.formState.errors.lodgingCapPerNight?.message}
        >
          <Input placeholder="5000.00" {...form.register('lodgingCapPerNight')} />
        </Field>
        <Field label="Lodging currency">
          <Input maxLength={3} {...form.register('lodgingCurrency')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Local conveyance / day"
          error={form.formState.errors.localConveyanceCapPerDay?.message}
        >
          <Input placeholder="500.00" {...form.register('localConveyanceCapPerDay')} />
        </Field>
        <Field label="Conveyance currency">
          <Input maxLength={3} {...form.register('localConveyanceCurrency')} />
        </Field>
      </div>
      <Field label="Effective from" error={form.formState.errors.effectiveFrom?.message}>
        <Input type="date" {...form.register('effectiveFrom')} />
      </Field>
    </>
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
      cityTier: 'METRO',
      perDiemAmount: '',
      perDiemCurrency: 'INR',
      lodgingCapPerNight: '',
      lodgingCurrency: 'INR',
      travelClass: 'FLIGHT_ECONOMY',
      localConveyanceCapPerDay: '',
      localConveyanceCurrency: 'INR',
      effectiveFrom: new Date().toISOString().slice(0, 10),
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New entitlement row
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <form
          onSubmit={form.handleSubmit((v) => {
            onSubmit(v);
            setOpen(false);
            form.reset();
          })}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>New entitlement row</DialogTitle>
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
          <FormBody form={form} />
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
  row,
  onSubmit,
  pending,
}: {
  grades: Grade[];
  row: EntitlementRow;
  onSubmit: (v: UpdateInput) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<Input>({
    resolver: zodResolver(Schema),
    defaultValues: { ...row, effectiveFrom: row.effectiveFrom.slice(0, 10) },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset({ ...row, effectiveFrom: row.effectiveFrom.slice(0, 10) });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <form
          onSubmit={form.handleSubmit((v) => {
            onSubmit(v);
            setOpen(false);
          })}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Edit entitlement row</DialogTitle>
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
          <FormBody form={form} />
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
