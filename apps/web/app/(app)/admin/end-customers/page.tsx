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
import type { EndCustomer } from '@/lib/types';

const Schema = z.object({
  name: z.string().min(1).max(200),
  industry: z
    .string()
    .max(80)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
type Input = z.infer<typeof Schema>;
type UpdateInput = Partial<Input> & { active?: boolean };

export default function EndCustomersPage() {
  const r = useResource<EndCustomer, Input, UpdateInput>('end-customers', {
    listQuery: { includeInactive: 'true' },
  });
  return (
    <AdminShell
      title="End Customers"
      description="The bank/airport/government/energy entities our clients ultimately serve."
      actions={<CreateDialog onSubmit={(v) => r.create.mutate(v)} pending={r.create.isPending} />}
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.list.isLoading && <TableEmpty colSpan={4}>Loading…</TableEmpty>}
            {r.list.data?.length === 0 && (
              <TableEmpty colSpan={4}>No end customers yet.</TableEmpty>
            )}
            {r.list.data?.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.name}</TableCell>
                <TableCell className="text-muted-foreground">{e.industry ?? '—'}</TableCell>
                <TableCell>
                  {e.active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <EditDialog
                      ec={e}
                      onSubmit={(input) => r.update.mutate({ id: e.id, input })}
                      pending={r.update.isPending}
                    />
                    {e.active && (
                      <ConfirmDelete
                        label={e.name}
                        onConfirm={() => r.remove.mutate(e.id)}
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

function CreateDialog({ onSubmit, pending }: { onSubmit: (v: Input) => void; pending: boolean }) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<Input>({ resolver: zodResolver(Schema), defaultValues: { name: '' } });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New end customer
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
            <DialogTitle>New end customer</DialogTitle>
          </DialogHeader>
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input placeholder="State Bank of India" {...form.register('name')} />
          </Field>
          <Field label="Industry (optional)">
            <Input placeholder="Banking" {...form.register('industry')} />
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
  ec,
  onSubmit,
  pending,
}: {
  ec: EndCustomer;
  onSubmit: (v: UpdateInput) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<Input>({
    resolver: zodResolver(Schema),
    defaultValues: { name: ec.name, industry: ec.industry ?? undefined },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset({ name: ec.name, industry: ec.industry ?? undefined });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit ${ec.name}`}>
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
            <DialogTitle>Edit {ec.name}</DialogTitle>
          </DialogHeader>
          <Field label="Name">
            <Input {...form.register('name')} />
          </Field>
          <Field label="Industry">
            <Input {...form.register('industry')} />
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
