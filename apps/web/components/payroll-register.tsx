'use client';

import * as React from 'react';
import { Wallet, Users as UsersIcon, TrendingDown, AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { StatCard } from '@/components/stat-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatMoney } from '@/lib/format';

interface Component {
  label: string;
  type: 'EARNING' | 'DEDUCTION';
  amount: number;
}
interface Row {
  userId: string;
  name: string;
  jobTitle: string | null;
  department: string | null;
  currency: string;
  hasStructure: boolean;
  gross: number;
  deductions: number;
  net: number;
}
interface Register {
  period: string;
  rows: Row[];
  totals: { headcount: number; grossTotal: number; deductionsTotal: number; netTotal: number };
  flags: { missingStructure: number; missingStructureNames: string[] };
}

const money = (n: number) => formatMoney(String(n));

export function PayrollRegister({ initial }: { initial: Register | null }) {
  const [reg, setReg] = React.useState<Register | null>(initial);
  const [editing, setEditing] = React.useState<Row | null>(null);

  const refresh = React.useCallback(async () => {
    const r = await fetch('/api/payroll/register', { cache: 'no-store' });
    if (r.ok) setReg((await r.json()) as Register);
  }, []);

  React.useEffect(() => {
    if (!initial) void refresh();
  }, [initial, refresh]);

  const t = reg?.totals;

  return (
    <AdminShell
      title="Payroll"
      description={reg ? `Monthly register · ${reg.period}` : 'Monthly payroll register'}
    >
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label="Net payroll" value={t?.netTotal ?? 0} money hint={`Gross ${money(t?.grossTotal ?? 0)}`} tone="primary" icon={<Wallet className="h-4 w-4" />} />
        <StatCard index={1} label="Gross" value={t?.grossTotal ?? 0} money hint="Before deductions" tone="positive" icon={<Wallet className="h-4 w-4" />} />
        <StatCard index={2} label="On payroll" value={t?.headcount ?? 0} hint="Employees with a structure" tone="muted" icon={<UsersIcon className="h-4 w-4" />} />
        <StatCard
          index={3}
          label="Missing structure"
          value={reg?.flags.missingStructure ?? 0}
          hint={reg?.flags.missingStructure ? 'Need a salary structure' : 'All set'}
          tone={reg?.flags.missingStructure ? 'negative' : 'positive'}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      {reg && reg.flags.missingStructure > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="font-medium">{reg.flags.missingStructure} active employees have no salary structure:</span>
          <span className="text-muted-foreground">{reg.flags.missingStructureNames.join(', ')}</span>
        </div>
      )}

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Employee</TableHead>
              <TableHead className="w-40">Department</TableHead>
              <TableHead className="w-32 text-right">Gross</TableHead>
              <TableHead className="w-32 text-right">Deductions</TableHead>
              <TableHead className="w-32 text-right">Net pay</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!reg && <TableEmpty colSpan={6}>Loading…</TableEmpty>}
            {reg && reg.rows.length === 0 && <TableEmpty colSpan={6}>No salary structures yet.</TableEmpty>}
            {reg?.rows.map((r) => (
              <TableRow key={r.userId}>
                <TableCell className="text-sm font-medium">{r.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.department || '—'}</TableCell>
                <TableCell className="text-right font-mono text-xs">{money(r.gross)}</TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">−{money(r.deductions)}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold">{money(r.net)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setEditing(r)}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {editing && (
        <SalaryEditor
          userId={editing.userId}
          name={editing.name}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </AdminShell>
  );
}

function SalaryEditor({
  userId,
  name,
  onClose,
  onSaved,
}: {
  userId: string;
  name: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [components, setComponents] = React.useState<Component[] | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    void fetch(`/api/payroll/salaries/${userId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { components: Component[] }) =>
        setComponents(
          d.components.length
            ? d.components
            : [
                { label: 'Basic', type: 'EARNING', amount: 0 },
                { label: 'HRA', type: 'EARNING', amount: 0 },
              ],
        ),
      );
  }, [userId]);

  function update(i: number, patch: Partial<Component>) {
    setComponents((cs) => cs && cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addRow() {
    setComponents((cs) => [...(cs ?? []), { label: '', type: 'EARNING', amount: 0 }]);
  }
  function removeRow(i: number) {
    setComponents((cs) => cs && cs.filter((_, idx) => idx !== i));
  }

  const gross = (components ?? []).filter((c) => c.type === 'EARNING').reduce((s, c) => s + (c.amount || 0), 0);
  const ded = (components ?? []).filter((c) => c.type === 'DEDUCTION').reduce((s, c) => s + (c.amount || 0), 0);

  async function save() {
    if (!components) return;
    setSaving(true);
    await fetch(`/api/payroll/salaries/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ components: components.filter((c) => c.label.trim()) }),
    });
    setSaving(false);
    await onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Salary structure — {name}</DialogTitle>
        </DialogHeader>
        {!components ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-2">
            {components.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  placeholder="Component"
                  value={c.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
                <Select value={c.type} onValueChange={(v) => update(i, { type: v as Component['type'] })}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EARNING">Earning</SelectItem>
                    <SelectItem value="DEDUCTION">Deduction</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  className="w-28"
                  value={c.amount}
                  onChange={(e) => update(i, { amount: Number(e.target.value) })}
                />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeRow(i)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" /> Add component
            </Button>
            <div className="mt-2 flex items-center justify-between rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <TrendingDown className="h-3 w-3" /> Gross {money(gross)} · Deductions {money(ded)}
              </span>
              <span className="font-mono font-semibold">Net {money(gross - ded)}</span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={save} disabled={saving || !components}>
            {saving ? 'Saving…' : 'Save structure'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
