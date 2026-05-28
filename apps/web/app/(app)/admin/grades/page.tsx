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
import type { Grade } from '@/lib/types';

const CreateSchema = z.object({
  code: z
    .string()
    .min(1, 'Required')
    .max(16)
    .regex(/^[A-Z0-9_-]+$/, 'Use A-Z, 0-9, _ or -'),
  name: z.string().min(1, 'Required').max(120),
  seniorityOrder: z.coerce.number().int().nonnegative(),
});
type CreateInput = z.infer<typeof CreateSchema>;

const UpdateSchema = CreateSchema.partial().extend({ active: z.boolean().optional() });
type UpdateInput = z.infer<typeof UpdateSchema>;

export default function GradesPage() {
  const r = useResource<Grade, CreateInput, UpdateInput>('grades', {
    listQuery: { includeInactive: 'true' },
  });

  return (
    <AdminShell
      title="Grades"
      description="Employee seniority bands. Drives cost rate, entitlement matrix, travel class."
      actions={
        <CreateGradeDialog onSubmit={(v) => r.create.mutate(v)} pending={r.create.isPending} />
      }
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-32">Seniority</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.list.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {r.list.error && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-destructive">
                  {(r.list.error as Error).message}
                </TableCell>
              </TableRow>
            )}
            {r.list.data?.length === 0 && <TableEmpty colSpan={5}>No grades yet.</TableEmpty>}
            {r.list.data?.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-mono text-xs">{g.code}</TableCell>
                <TableCell>{g.name}</TableCell>
                <TableCell>{g.seniorityOrder}</TableCell>
                <TableCell>
                  {g.deletedAt ? (
                    <Badge variant="destructive">Deleted</Badge>
                  ) : g.active ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <EditGradeDialog
                      grade={g}
                      onSubmit={(input) => r.update.mutate({ id: g.id, input })}
                      pending={r.update.isPending}
                    />
                    {!g.deletedAt && (
                      <ConfirmDelete
                        label={g.code}
                        onConfirm={() => r.remove.mutate(g.id)}
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

function CreateGradeDialog({
  onSubmit,
  pending,
}: {
  onSubmit: (v: CreateInput) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<CreateInput>({
    resolver: zodResolver(CreateSchema),
    defaultValues: { code: '', name: '', seniorityOrder: 0 },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) form.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New grade
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
            <DialogTitle>New grade</DialogTitle>
            <DialogDescription>
              Code must be unique (e.g. L1–L5). Seniority order drives default sort.
            </DialogDescription>
          </DialogHeader>
          <Field label="Code" error={form.formState.errors.code?.message}>
            <Input placeholder="L6" {...form.register('code')} />
          </Field>
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input placeholder="Director" {...form.register('name')} />
          </Field>
          <Field label="Seniority order" error={form.formState.errors.seniorityOrder?.message}>
            <Input type="number" min={0} {...form.register('seniorityOrder')} />
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

function EditGradeDialog({
  grade,
  onSubmit,
  pending,
}: {
  grade: Grade;
  onSubmit: (v: UpdateInput) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<UpdateInput>({
    resolver: zodResolver(UpdateSchema),
    defaultValues: {
      code: grade.code,
      name: grade.name,
      seniorityOrder: grade.seniorityOrder,
      active: grade.active,
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o)
          form.reset({
            code: grade.code,
            name: grade.name,
            seniorityOrder: grade.seniorityOrder,
            active: grade.active,
          });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit ${grade.code}`}>
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
            <DialogTitle>Edit {grade.code}</DialogTitle>
          </DialogHeader>
          <Field label="Code" error={form.formState.errors.code?.message}>
            <Input {...form.register('code')} />
          </Field>
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input {...form.register('name')} />
          </Field>
          <Field label="Seniority order" error={form.formState.errors.seniorityOrder?.message}>
            <Input type="number" min={0} {...form.register('seniorityOrder')} />
          </Field>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label htmlFor="grade-active">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive grades are hidden by default.
              </p>
            </div>
            <Switch
              id="grade-active"
              checked={form.watch('active') ?? true}
              onCheckedChange={(v) => form.setValue('active', v, { shouldDirty: true })}
            />
          </div>
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
