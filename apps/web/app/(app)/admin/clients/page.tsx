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
import type { Client, ClientKind } from '@/lib/types';

const Schema = z.object({
  name: z.string().min(1).max(160),
  kind: z.enum(['SI', 'OEM']),
});
type Input = z.infer<typeof Schema>;
type UpdateInput = Partial<Input> & { active?: boolean };

export default function ClientsPage() {
  const r = useResource<Client, Input, UpdateInput>('clients', {
    listQuery: { includeInactive: 'true' },
  });
  return (
    <AdminShell
      title="Clients (SI / OEM)"
      description="Direct clients we deliver to — System Integrators (e.g. NTT, Airtel) and OEMs (e.g. Cisco)."
      actions={<CreateDialog onSubmit={(v) => r.create.mutate(v)} pending={r.create.isPending} />}
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-24">Kind</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.list.isLoading && <TableEmpty colSpan={4}>Loading…</TableEmpty>}
            {r.list.data?.length === 0 && <TableEmpty colSpan={4}>No clients yet.</TableEmpty>}
            {r.list.data?.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {c.kind}
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
                      client={c}
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

function CreateDialog({ onSubmit, pending }: { onSubmit: (v: Input) => void; pending: boolean }) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<Input>({
    resolver: zodResolver(Schema),
    defaultValues: { name: '', kind: 'SI' },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New client
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
            <DialogTitle>New client</DialogTitle>
          </DialogHeader>
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input placeholder="NTT Data" {...form.register('name')} />
          </Field>
          <Field label="Kind">
            <Select
              value={form.watch('kind')}
              onValueChange={(v) => form.setValue('kind', v as ClientKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SI">SI — System Integrator</SelectItem>
                <SelectItem value="OEM">OEM — Hardware/SW vendor</SelectItem>
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
  client,
  onSubmit,
  pending,
}: {
  client: Client;
  onSubmit: (v: UpdateInput) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<Input>({
    resolver: zodResolver(Schema),
    defaultValues: { name: client.name, kind: client.kind },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset({ name: client.name, kind: client.kind });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit ${client.name}`}>
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
            <DialogTitle>Edit {client.name}</DialogTitle>
          </DialogHeader>
          <Field label="Name">
            <Input {...form.register('name')} />
          </Field>
          <Field label="Kind">
            <Select
              value={form.watch('kind')}
              onValueChange={(v) => form.setValue('kind', v as ClientKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SI">SI</SelectItem>
                <SelectItem value="OEM">OEM</SelectItem>
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
