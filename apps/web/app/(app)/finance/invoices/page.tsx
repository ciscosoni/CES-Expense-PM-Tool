'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { formatDate, formatMoney } from '@/lib/format';
import type { ProjectRow } from '@/lib/types';

interface Invoice {
  id: string;
  number: string;
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  currency: string;
  subtotal: string;
  total: string;
  issueDate: string;
  project?: { code: string };
  client?: { name: string };
  lines: unknown[];
}

const TONE: Record<string, string> = {
  DRAFT: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  SENT: 'bg-blue-100 text-blue-700 border-blue-200',
  PAID: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
};

export default function InvoicesPage() {
  const qc = useQueryClient();
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: () => api.get<Invoice[]>('/invoices') });
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.get<ProjectRow[]>('/projects') });

  const [projectId, setProjectId] = React.useState('');
  const [from, setFrom] = React.useState('2024-01-01');
  const [to, setTo] = React.useState(new Date().toISOString().slice(0, 10));
  const [tax, setTax] = React.useState('18');

  const generate = useMutation({
    mutationFn: () =>
      api.post('/invoices/generate', { projectId, from, to, taxPercent: Number(tax) || 0 }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Draft invoice generated from billable time');
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'send' | 'paid' }) => api.post(`/invoices/${id}/${action}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Updated');
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });

  return (
    <AdminShell
      title="Invoices"
      description="Generate client invoices from billable time (hours × bill rate). Mark sent and paid."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (projectId) generate.mutate();
        }}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
      >
        <div className="min-w-[16rem] space-y-1.5">
          <Label>Project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label>Tax %</Label>
          <Input value={tax} onChange={(e) => setTax(e.target.value)} className="w-20" />
        </div>
        <Button type="submit" disabled={!projectId || generate.isPending}>
          {generate.isPending ? 'Generating…' : 'Generate invoice'}
        </Button>
      </form>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Project · Client</TableHead>
              <TableHead className="w-28">Issued</TableHead>
              <TableHead className="text-right w-36">Total</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.isLoading && <TableEmpty colSpan={6}>Loading…</TableEmpty>}
            {invoices.data?.length === 0 && <TableEmpty colSpan={6}>No invoices yet — generate one above.</TableEmpty>}
            {invoices.data?.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                <TableCell className="text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{inv.project?.code}</span> · {inv.client?.name}
                </TableCell>
                <TableCell className="font-mono text-xs">{formatDate(inv.issueDate)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{formatMoney(inv.total, inv.currency)}</TableCell>
                <TableCell>
                  <Badge className={`border ${TONE[inv.status] ?? TONE.DRAFT}`}>{inv.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {inv.status === 'DRAFT' && (
                      <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: inv.id, action: 'send' })}>
                        Mark sent
                      </Button>
                    )}
                    {(inv.status === 'SENT' || inv.status === 'PARTIALLY_PAID') && (
                      <Button size="sm" onClick={() => setStatus.mutate({ id: inv.id, action: 'paid' })}>
                        Mark paid
                      </Button>
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
