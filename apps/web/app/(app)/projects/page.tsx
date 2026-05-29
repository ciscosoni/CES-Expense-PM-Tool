'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
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
import { ApiError, api } from '@/lib/api';
import { formatDate, formatMoney, projectStatusColor } from '@/lib/format';
import type {
  BillingModel,
  Client,
  EndCustomer,
  ProjectCategory,
  ProjectRow,
  ProjectStatus,
  UserBrief,
} from '@/lib/types';

const CATEGORIES: ProjectCategory[] = [
  'ACI',
  'NON_ACI',
  'SD_WAN',
  'SECURITY',
  'AUDIT',
  'MANAGED_SERVICES',
];
const BILLING: BillingModel[] = ['FIXED_PRICE', 'T_AND_M', 'MILESTONE'];
const STATUSES: ProjectStatus[] = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'CANCELLED'];

const STATUS_COLORS: Record<'green' | 'amber' | 'red' | 'gray', string> = {
  green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  gray: 'bg-neutral-100 text-neutral-700 border-neutral-200',
};

export const StatusBadge = ({ status }: { status: ProjectStatus }) => (
  <Badge className={`border ${STATUS_COLORS[projectStatusColor(status)]}`}>{status}</Badge>
);

export default function ProjectsPage() {
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<ProjectRow[]>('/projects'),
  });

  return (
    <AdminShell
      title="Projects"
      description="Active and historical engagements. Click a row to open the project workspace."
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/projects/onboard"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gradient-to-r from-[hsl(var(--ai-from))] via-[hsl(var(--ai-via))] to-[hsl(var(--ai-to))] px-3 text-sm font-medium text-white shadow-lg transition hover:opacity-90"
          >
            <span className="text-base leading-none">✨</span> Onboard with AI
          </Link>
          <CreateProjectDialog />
        </div>
      }
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Client → End customer</TableHead>
              <TableHead className="w-32">Billing</TableHead>
              <TableHead className="text-right w-36">Contract value</TableHead>
              <TableHead className="w-44">Planned</TableHead>
              <TableHead className="w-28">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.isLoading && <TableEmpty colSpan={7}>Loading…</TableEmpty>}
            {projects.data?.length === 0 && <TableEmpty colSpan={7}>No projects yet.</TableEmpty>}
            {projects.data?.map((p) => (
              <TableRow key={p.id} className="cursor-pointer">
                <TableCell className="font-mono text-xs">
                  <Link href={`/projects/${p.id}`} className="underline-offset-2 hover:underline">
                    {p.code}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/projects/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                  {p.whiteLabel && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      WHITE-LABEL
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{p.client.name}</span>
                  {p.endCustomer && (
                    <>
                      <span className="mx-1">→</span>
                      <span>{p.endCustomer.name}</span>
                    </>
                  )}
                </TableCell>
                <TableCell className="text-xs">{p.billingModel}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatMoney(p.contractValue, p.contractCurrency)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {formatDate(p.plannedStart)} → {formatDate(p.plannedEnd)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={p.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}

const CreateProjectSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, 'A-Z 0-9 _ -'),
  name: z.string().min(1).max(200),
  clientId: z.string().uuid('Pick a client'),
  endCustomerId: z
    .string()
    .uuid()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v)),
  whiteLabel: z.boolean().default(false),
  category: z.enum(['ACI', 'NON_ACI', 'SD_WAN', 'SECURITY', 'AUDIT', 'MANAGED_SERVICES']),
  billingModel: z.enum(['FIXED_PRICE', 'T_AND_M', 'MILESTONE']),
  contractValue: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Numeric, up to 4 decimals'),
  contractCurrency: z.string().length(3).default('INR'),
  pmId: z.string().uuid('Pick a PM'),
  plannedStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'CANCELLED']).default('DRAFT'),
});
type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

function CreateProjectDialog() {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const clients = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<Client[]>('/master-data/clients'),
    enabled: open,
  });
  const ecs = useQuery({
    queryKey: ['end-customers'],
    queryFn: () => api.get<EndCustomer[]>('/master-data/end-customers'),
    enabled: open,
  });
  const pms = useQuery({
    queryKey: ['users', { role: 'PROJECT_MANAGER' }],
    queryFn: () => api.get<UserBrief[]>('/users', { query: { role: 'PROJECT_MANAGER' } }),
    enabled: open,
  });

  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: {
      code: '',
      name: '',
      clientId: '',
      endCustomerId: '',
      whiteLabel: false,
      category: 'ACI',
      billingModel: 'FIXED_PRICE',
      contractValue: '',
      contractCurrency: 'INR',
      pmId: '',
      plannedStart: new Date().toISOString().slice(0, 10),
      plannedEnd: new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10),
      status: 'DRAFT',
    },
  });

  const create = useMutation({
    mutationFn: (input: CreateProjectInput) => api.post<ProjectRow>('/projects', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created');
      setOpen(false);
      form.reset();
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" error={form.formState.errors.code?.message}>
              <Input placeholder="ACME-DC-001" {...form.register('code')} />
            </Field>
            <Field label="Status">
              <Select
                value={form.watch('status')}
                onValueChange={(v) => form.setValue('status', v as ProjectStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input placeholder="Site DC build for ACME" {...form.register('name')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client (SI/OEM)" error={form.formState.errors.clientId?.message}>
              <Select
                value={form.watch('clientId')}
                onValueChange={(v) => form.setValue('clientId', v, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a client…" />
                </SelectTrigger>
                <SelectContent>
                  {clients.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.kind})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="End customer (optional)">
              <Select
                value={form.watch('endCustomerId') ?? ''}
                onValueChange={(v) =>
                  form.setValue(
                    'endCustomerId',
                    v as unknown as CreateProjectInput['endCustomerId'],
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {ecs.data?.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select
                value={form.watch('category')}
                onValueChange={(v) => form.setValue('category', v as ProjectCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Billing model">
              <Select
                value={form.watch('billingModel')}
                onValueChange={(v) => form.setValue('billingModel', v as BillingModel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Contract value" error={form.formState.errors.contractValue?.message}>
              <Input placeholder="4500000.00" {...form.register('contractValue')} />
            </Field>
            <Field label="Currency">
              <Input maxLength={3} {...form.register('contractCurrency')} />
            </Field>
            <Field label="PM" error={form.formState.errors.pmId?.message}>
              <Select
                value={form.watch('pmId')}
                onValueChange={(v) => form.setValue('pmId', v, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a PM…" />
                </SelectTrigger>
                <SelectContent>
                  {pms.data?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Planned start" error={form.formState.errors.plannedStart?.message}>
              <Input type="date" {...form.register('plannedStart')} />
            </Field>
            <Field label="Planned end" error={form.formState.errors.plannedEnd?.message}>
              <Input type="date" {...form.register('plannedEnd')} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Create project'}
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
