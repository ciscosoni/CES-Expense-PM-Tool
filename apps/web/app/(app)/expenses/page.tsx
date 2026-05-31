'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, ChevronRight, Plus, ScanLine, Send } from 'lucide-react';
import { ReceiptUpload } from '@/components/expenses/receipt-upload';
import { AiBadge } from '@/components/ai-badge';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
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
import { formatDate, formatMoney } from '@/lib/format';
import type { Expense, ExpenseCategory, ExpenseStatus, ProjectRow } from '@/lib/types';

const CATEGORIES: ExpenseCategory[] = [
  'TRAVEL',
  'LODGING',
  'MEALS',
  'LOCAL_CONVEYANCE',
  'COMMUNICATION',
  'MATERIALS',
  'OTHER',
];

const STATUS_COLOR: Record<ExpenseStatus, string> = {
  DRAFT: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  SUBMITTED: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-blue-100 text-blue-700 border-blue-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
  REIMBURSED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export default function MyExpensesPage() {
  const qc = useQueryClient();
  const expenses = useQuery({
    queryKey: ['expenses', 'mine'],
    queryFn: () => api.get<Expense[]>('/expenses/mine'),
  });

  const submit = useMutation({
    mutationFn: (id: string) => api.post(`/expenses/${id}/submit`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Submitted for approval');
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  const totalPending = expenses.data
    ?.filter((e) => ['SUBMITTED', 'APPROVED'].includes(e.status))
    .reduce((s, e) => s + Number(e.amount), 0);

  return (
    <AdminShell
      title="My Expenses"
      description={
        <span className="text-sm">
          You have{' '}
          <span className="font-mono font-medium">
            {expenses.data?.filter((e) => e.status === 'SUBMITTED').length ?? 0}
          </span>{' '}
          awaiting approval,{' '}
          <span className="font-mono font-medium">
            {totalPending?.toLocaleString('en-IN') ?? '0'}
          </span>{' '}
          INR pending payout.
        </span>
      }
      actions={<NewExpenseDialog />}
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Date</TableHead>
              <TableHead className="w-36">Category</TableHead>
              <TableHead>Project · Notes</TableHead>
              <TableHead className="text-right w-32">Amount</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.isLoading && <TableEmpty colSpan={6}>Loading…</TableEmpty>}
            {expenses.data?.length === 0 && <TableEmpty colSpan={6}>No expenses yet.</TableEmpty>}
            {expenses.data?.map((e) => (
              <ExpenseRow key={e.id} expense={e} submit={submit} />
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}

const NewExpenseSchema = z.object({
  projectId: z.string().uuid('Pick a project'),
  category: z.enum([
    'TRAVEL',
    'LODGING',
    'MEALS',
    'LOCAL_CONVEYANCE',
    'COMMUNICATION',
    'MATERIALS',
    'OTHER',
  ]),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Numeric'),
  currency: z.string().length(3).default('INR'),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});
type NewExpenseInput = z.infer<typeof NewExpenseSchema>;

interface ReceiptAnalysis {
  ocr: { source: 'azure' | 'mock'; vendor?: string; amount?: string; currency?: string } | null;
  suggestion: {
    amount: string | null;
    currency: string | null;
    incurredOn: string | null;
    category: string | null;
    notes: string | null;
    tripId: string | null;
    projectId: string | null;
  };
}

/** Read a File into a bare base64 string (no data: prefix) for the API. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function NewExpenseDialog() {
  const [open, setOpen] = React.useState(false);
  const qc = useQueryClient();
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<ProjectRow[]>('/projects'),
    enabled: open,
  });
  const form = useForm<NewExpenseInput>({
    resolver: zodResolver(NewExpenseSchema),
    defaultValues: {
      projectId: '',
      category: 'MEALS',
      amount: '',
      currency: 'INR',
      incurredOn: new Date().toISOString().slice(0, 10),
      notes: '',
    },
  });
  // Snapped receipt held in state until the expense exists, then attached.
  const [scan, setScan] = React.useState<{ name: string; type: string; base64: string } | null>(
    null,
  );
  const [analyzing, setAnalyzing] = React.useState(false);

  async function handleScan(file: File) {
    setAnalyzing(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await api.post<ReceiptAnalysis>('/receipts/analyze', {
        fileName: file.name,
        contentType: file.type || 'image/jpeg',
        fileBase64: base64,
      });
      setScan({ name: file.name, type: file.type || 'image/jpeg', base64 });
      const s = res.suggestion;
      if (s.amount) form.setValue('amount', s.amount, { shouldDirty: true });
      if (s.currency) form.setValue('currency', s.currency);
      if (s.incurredOn) form.setValue('incurredOn', s.incurredOn);
      if (s.category) form.setValue('category', s.category as ExpenseCategory);
      if (s.notes) form.setValue('notes', s.notes);
      if (s.projectId) form.setValue('projectId', s.projectId, { shouldDirty: true });
      toast.success(
        `Prefilled from receipt${res.ocr?.source === 'mock' ? ' (simulated OCR — real in cloud)' : ''}.`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not read receipt');
    } finally {
      setAnalyzing(false);
    }
  }

  const create = useMutation({
    mutationFn: async (input: NewExpenseInput) => {
      const expense = await api.post<Expense>('/expenses', input);
      if (scan) {
        await api
          .post('/receipts', {
            expenseId: expense.id,
            fileName: scan.name,
            contentType: scan.type,
            fileBase64: scan.base64,
          })
          .catch(() => undefined); // expense is saved; receipt flags are non-blocking
      }
      return expense;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Saved as draft. Submit when ready.');
      setOpen(false);
      setScan(null);
      form.reset();
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New expense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New expense</DialogTitle>
            <DialogDescription>
              Snap or upload the receipt to auto-fill — we read the amount, date, vendor and
              category, and match it to your trip. Or enter the line manually.
            </DialogDescription>
          </DialogHeader>

          <label
            className="ai-surface flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors hover:bg-accent/30"
            aria-busy={analyzing}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[linear-gradient(135deg,hsl(var(--ai-from)),hsl(var(--ai-to)))] text-white">
              <ScanLine className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {analyzing ? 'Reading receipt…' : scan ? 'Receipt attached — re-scan?' : 'Scan a receipt'}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {scan ? scan.name : 'JPG/PNG/PDF — auto-fills the form below'}
              </span>
            </span>
            <AiBadge label="AI" />
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              disabled={analyzing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleScan(f);
                e.target.value = '';
              }}
            />
          </label>

          <Field label="Project" error={form.formState.errors.projectId?.message}>
            <Select
              value={form.watch('projectId')}
              onValueChange={(v) => form.setValue('projectId', v, { shouldDirty: true })}
            >
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
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select
                value={form.watch('category')}
                onValueChange={(v) => form.setValue('category', v as ExpenseCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Incurred on">
              <Input type="date" {...form.register('incurredOn')} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Amount" error={form.formState.errors.amount?.message}>
              <Input placeholder="0.00" {...form.register('amount')} />
            </Field>
            <Field label="Currency">
              <Input maxLength={3} {...form.register('currency')} />
            </Field>
            <div />
          </div>
          <Field label="Notes">
            <Input placeholder="What was this for?" {...form.register('notes')} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Save as draft'}
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

function ExpenseRow({
  expense,
  submit,
}: {
  expense: Expense;
  submit: { mutate: (id: string) => void; isPending: boolean };
}) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <>
      <TableRow>
        <TableCell className="font-mono text-xs">{formatDate(expense.incurredOn)}</TableCell>
        <TableCell className="text-xs">{expense.category.replace(/_/g, ' ')}</TableCell>
        <TableCell>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-left hover:underline"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span>
              <span className="block text-xs text-muted-foreground">{expense.project.code}</span>
              {expense.notes && <span className="text-sm">{expense.notes}</span>}
            </span>
          </button>
          {expense.rejectReason && (
            <div className="mt-1 text-xs text-destructive">Rejected: {expense.rejectReason}</div>
          )}
        </TableCell>
        <TableCell className="text-right font-mono text-xs">
          {formatMoney(expense.amount, expense.currency)}
        </TableCell>
        <TableCell>
          <Badge className={`border ${STATUS_COLOR[expense.status]}`}>{expense.status}</Badge>
        </TableCell>
        <TableCell className="text-right">
          {(expense.status === 'DRAFT' || expense.status === 'REJECTED') && (
            <Button size="sm" onClick={() => submit.mutate(expense.id)} disabled={submit.isPending}>
              <Send className="h-3.5 w-3.5" /> Submit
            </Button>
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Receipts (anti-fraud detection runs on upload)
            </p>
            <ReceiptUpload expenseId={expense.id} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
