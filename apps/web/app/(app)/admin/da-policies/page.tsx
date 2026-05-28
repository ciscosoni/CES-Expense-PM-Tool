'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { ConfirmDelete } from '@/components/admin/confirm-delete';
import { useResource } from '@/components/admin/use-resource';
import type { DaPolicy } from '@/lib/types';

const Schema = z.object({
  name: z.string().min(1).max(120),
  partialDayPercent: z.coerce.number().min(0).max(1),
  intraCitySameDayPaysDa: z.boolean().default(false),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
});
type Input = z.infer<typeof Schema>;
type UpdateInput = Partial<Input>;

export default function DaPoliciesPage() {
  const r = useResource<DaPolicy, Input, UpdateInput>('da-policies');
  return (
    <AdminShell
      title="DA Policies"
      description="Time-versioned: departure/return day proration + intra-city same-day rule. DA engine picks the row effective on each trip date."
      actions={<CreateDialog onSubmit={(v) => r.create.mutate(v)} pending={r.create.isPending} />}
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-40">Partial-day %</TableHead>
              <TableHead className="w-44">Intra-city pays DA?</TableHead>
              <TableHead className="w-36">Effective from</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.list.isLoading && <TableEmpty colSpan={5}>Loading…</TableEmpty>}
            {r.list.data?.length === 0 && <TableEmpty colSpan={5}>No policies yet.</TableEmpty>}
            {r.list.data?.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.name}</TableCell>
                <TableCell className="font-mono text-xs">
                  {(Number(p.partialDayPercent) * 100).toFixed(0)}%
                </TableCell>
                <TableCell className="text-xs">{p.intraCitySameDayPaysDa ? 'Yes' : 'No'}</TableCell>
                <TableCell className="font-mono text-xs">{p.effectiveFrom.slice(0, 10)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <EditDialog
                      policy={p}
                      onSubmit={(input) => r.update.mutate({ id: p.id, input })}
                      pending={r.update.isPending}
                    />
                    <ConfirmDelete
                      label={p.name}
                      onConfirm={() => r.remove.mutate(p.id)}
                      pending={r.remove.isPending}
                    />
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

function CreateDialog({ onSubmit, pending }: { onSubmit: (v: Input) => void; pending: boolean }) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<Input>({
    resolver: zodResolver(Schema),
    defaultValues: {
      name: '',
      partialDayPercent: 0.5,
      intraCitySameDayPaysDa: false,
      effectiveFrom: new Date().toISOString().slice(0, 10),
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New policy version
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
            <DialogTitle>New DA policy version</DialogTitle>
            <DialogDescription>
              Creating a new version does not delete prior versions — historical trips keep using
              their effective row.
            </DialogDescription>
          </DialogHeader>
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input placeholder="Standard 50% partial day" {...form.register('name')} />
          </Field>
          <Field
            label="Partial-day % (0.0–1.0)"
            error={form.formState.errors.partialDayPercent?.message}
          >
            <Input
              type="number"
              step="0.01"
              min={0}
              max={1}
              {...form.register('partialDayPercent')}
            />
          </Field>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label htmlFor="intra">Intra-city same-day pays DA</Label>
              <p className="text-xs text-muted-foreground">
                Off by default: same-day local trips only earn local conveyance.
              </p>
            </div>
            <Switch
              id="intra"
              checked={form.watch('intraCitySameDayPaysDa')}
              onCheckedChange={(v) =>
                form.setValue('intraCitySameDayPaysDa', v, { shouldDirty: true })
              }
            />
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
  policy,
  onSubmit,
  pending,
}: {
  policy: DaPolicy;
  onSubmit: (v: UpdateInput) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<Input>({
    resolver: zodResolver(Schema),
    defaultValues: {
      name: policy.name,
      partialDayPercent: Number(policy.partialDayPercent),
      intraCitySameDayPaysDa: policy.intraCitySameDayPaysDa,
      effectiveFrom: policy.effectiveFrom.slice(0, 10),
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o)
          form.reset({
            name: policy.name,
            partialDayPercent: Number(policy.partialDayPercent),
            intraCitySameDayPaysDa: policy.intraCitySameDayPaysDa,
            effectiveFrom: policy.effectiveFrom.slice(0, 10),
          });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit ${policy.name}`}>
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
            <DialogTitle>Edit policy</DialogTitle>
          </DialogHeader>
          <Field label="Name">
            <Input {...form.register('name')} />
          </Field>
          <Field label="Partial-day %">
            <Input
              type="number"
              step="0.01"
              min={0}
              max={1}
              {...form.register('partialDayPercent')}
            />
          </Field>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label>Intra-city pays DA</Label>
            <Switch
              checked={form.watch('intraCitySameDayPaysDa')}
              onCheckedChange={(v) =>
                form.setValue('intraCitySameDayPaysDa', v, { shouldDirty: true })
              }
            />
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
