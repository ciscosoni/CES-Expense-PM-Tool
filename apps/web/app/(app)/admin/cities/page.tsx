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
import type { City, CityTier } from '@/lib/types';

const TIERS: CityTier[] = ['METRO', 'TIER_2', 'TIER_3', 'INTERNATIONAL'];

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  state: z
    .string()
    .max(120)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  country: z.string().length(2).toUpperCase().default('IN'),
  tier: z.enum(['METRO', 'TIER_2', 'TIER_3', 'INTERNATIONAL']),
});
type CreateInput = z.infer<typeof CreateSchema>;
type UpdateInput = Partial<CreateInput> & { active?: boolean };

export default function CitiesPage() {
  const r = useResource<City, CreateInput, UpdateInput>('cities', {
    listQuery: { includeInactive: 'true' },
  });

  return (
    <AdminShell
      title="Cities"
      description="City master with tier (Metro / Tier-2 / Tier-3 / International). Drives DA + lodging caps."
      actions={<CreateDialog onSubmit={(v) => r.create.mutate(v)} pending={r.create.isPending} />}
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-20">State</TableHead>
              <TableHead className="w-24">Country</TableHead>
              <TableHead className="w-32">Tier</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.list.isLoading && <TableEmpty colSpan={6}>Loading…</TableEmpty>}
            {r.list.data?.length === 0 && <TableEmpty colSpan={6}>No cities yet.</TableEmpty>}
            {r.list.data?.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.state ?? '—'}</TableCell>
                <TableCell className="font-mono text-xs">{c.country}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {c.tier}
                  </Badge>
                </TableCell>
                <TableCell>
                  {c.active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <EditDialog
                      city={c}
                      onSubmit={(input) => r.update.mutate({ id: c.id, input })}
                      pending={r.update.isPending}
                    />
                    {c.active && (
                      <ConfirmDelete
                        label={c.name}
                        onConfirm={() => r.remove.mutate(c.id)}
                        pending={r.remove.isPending}
                      />
                    )}
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

function CreateDialog({
  onSubmit,
  pending,
}: {
  onSubmit: (v: CreateInput) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<CreateInput>({
    resolver: zodResolver(CreateSchema),
    defaultValues: { name: '', state: undefined, country: 'IN', tier: 'METRO' },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New city
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
            <DialogTitle>New city</DialogTitle>
          </DialogHeader>
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input placeholder="Chennai" {...form.register('name')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State (optional)">
              <Input placeholder="TN" {...form.register('state')} />
            </Field>
            <Field label="Country (ISO-2)" error={form.formState.errors.country?.message}>
              <Input maxLength={2} {...form.register('country')} />
            </Field>
          </div>
          <Field label="Tier" error={form.formState.errors.tier?.message}>
            <Select
              value={form.watch('tier')}
              onValueChange={(v) => form.setValue('tier', v as CityTier)}
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
  city,
  onSubmit,
  pending,
}: {
  city: City;
  onSubmit: (v: UpdateInput) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<CreateInput>({
    resolver: zodResolver(CreateSchema),
    defaultValues: {
      name: city.name,
      state: city.state ?? undefined,
      country: city.country,
      tier: city.tier,
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o)
          form.reset({
            name: city.name,
            state: city.state ?? undefined,
            country: city.country,
            tier: city.tier,
          });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit ${city.name}`}>
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
            <DialogTitle>Edit {city.name}</DialogTitle>
          </DialogHeader>
          <Field label="Name">
            <Input {...form.register('name')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State">
              <Input {...form.register('state')} />
            </Field>
            <Field label="Country">
              <Input maxLength={2} {...form.register('country')} />
            </Field>
          </div>
          <Field label="Tier">
            <Select
              value={form.watch('tier')}
              onValueChange={(v) => form.setValue('tier', v as CityTier)}
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
