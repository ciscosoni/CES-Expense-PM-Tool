'use client';

import * as React from 'react';
import { Plus, ShoppingCart, Trash2, Wallet, ListChecks } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { StatCard } from '@/components/stat-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { formatMoney } from '@/lib/format';

type Kind = 'SALE' | 'PURCHASE';
type Status = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
const STATUSES: Status[] = ['DRAFT', 'SENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

interface Item {
  description: string;
  qty: number;
  unitPrice: number;
}
interface Order {
  id: string;
  orderNumber: string;
  kind: Kind;
  status: Status;
  partyName: string | null;
  projectCode: string | null;
  orderDate: string;
  currency: string;
  items: Item[];
  taxPercent: number;
  subtotal: number;
  tax: number;
  total: number;
}
interface ListResp {
  rows: Order[];
  summary: { total: number; open: number; openValue: number; totalValue: number };
}
interface Party {
  id: string;
  name: string;
}

const money = (n: number) => formatMoney(String(n));

export function OrdersView() {
  const [kind, setKind] = React.useState<Kind>('SALE');
  const [data, setData] = React.useState<ListResp | null>(null);
  const [clients, setClients] = React.useState<Party[]>([]);
  const [vendors, setVendors] = React.useState<Party[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async (k: Kind) => {
    setData(null);
    const r = await fetch(`/api/orders?kind=${k}`, { cache: 'no-store' });
    if (r.ok) setData((await r.json()) as ListResp);
  }, []);

  React.useEffect(() => {
    void load(kind);
  }, [kind, load]);

  React.useEffect(() => {
    void fetch('/api/master-data/clients', { cache: 'no-store' })
      .then((r) => r.json())
      .then((c: Party[]) => setClients(Array.isArray(c) ? c : []));
    void fetch('/api/vendors', { cache: 'no-store' })
      .then((r) => r.json())
      .then((v) => setVendors(Array.isArray(v) ? v : (v?.rows ?? [])));
  }, []);

  async function setStatus(id: string, status: Status) {
    setBusy(id);
    await fetch(`/api/orders/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load(kind);
    setBusy(null);
  }

  const s = data?.summary;
  const parties = kind === 'SALE' ? clients : vendors;
  const partyNoun = kind === 'SALE' ? 'Client' : 'Vendor';

  return (
    <AdminShell
      title="Orders"
      description="Sales orders to clients and purchase orders to vendors."
      actions={<NewOrderDialog kind={kind} parties={parties} partyNoun={partyNoun} onCreated={() => load(kind)} />}
    >
      <div className="mb-4 flex items-center gap-1.5">
        <button
          onClick={() => setKind('SALE')}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${kind === 'SALE' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground hover:text-foreground'}`}
        >
          Sales orders
        </button>
        <button
          onClick={() => setKind('PURCHASE')}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${kind === 'PURCHASE' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground hover:text-foreground'}`}
        >
          Purchase orders
        </button>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard index={0} label={kind === 'SALE' ? 'Open sales value' : 'Open PO value'} value={s?.openValue ?? 0} money hint={`${s?.open ?? 0} open`} tone="primary" icon={<Wallet className="h-4 w-4" />} />
        <StatCard index={1} label="Total value" value={s?.totalValue ?? 0} money hint="Excl. cancelled" tone="positive" icon={<ShoppingCart className="h-4 w-4" />} />
        <StatCard index={2} label="Orders" value={s?.total ?? 0} hint={`${kind === 'SALE' ? 'Sales' : 'Purchase'} orders`} tone="muted" icon={<ListChecks className="h-4 w-4" />} />
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28">Order #</TableHead>
              <TableHead>{partyNoun}</TableHead>
              <TableHead className="w-24">Date</TableHead>
              <TableHead className="w-36 text-right">Total</TableHead>
              <TableHead className="w-40">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data && <TableEmpty colSpan={5}>Loading…</TableEmpty>}
            {data && data.rows.length === 0 && (
              <TableEmpty colSpan={5}>No {kind === 'SALE' ? 'sales' : 'purchase'} orders yet.</TableEmpty>
            )}
            {data?.rows.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                <TableCell className="text-sm">
                  {o.partyName || '—'}
                  {o.projectCode && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{o.projectCode}</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{o.orderDate.slice(0, 10)}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold">{money(o.total)}</TableCell>
                <TableCell>
                  <Select value={o.status} onValueChange={(v) => setStatus(o.id, v as Status)}>
                    <SelectTrigger className="h-7 w-36 text-[11px]" disabled={busy === o.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((st) => (
                        <SelectItem key={st} value={st} className="text-xs">
                          {st[0] + st.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AdminShell>
  );
}

function NewOrderDialog({
  kind,
  parties,
  partyNoun,
  onCreated,
}: {
  kind: Kind;
  parties: Party[];
  partyNoun: string;
  onCreated: () => Promise<void> | void;
}) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [partyId, setPartyId] = React.useState<string>('');
  const [taxPercent, setTaxPercent] = React.useState('18');
  const [items, setItems] = React.useState<Item[]>([{ description: '', qty: 1, unitPrice: 0 }]);

  function up(i: number, patch: Partial<Item>) {
    setItems((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  const subtotal = items.reduce((s, i) => s + (i.qty || 0) * (i.unitPrice || 0), 0);
  const total = Math.round(subtotal * (1 + Number(taxPercent || 0) / 100));

  async function submit() {
    const clean = items.filter((i) => i.description.trim() && i.qty > 0);
    if (clean.length === 0) return;
    setSaving(true);
    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        partyId: partyId || undefined,
        taxPercent: Number(taxPercent || 0),
        items: clean,
      }),
    });
    setSaving(false);
    setOpen(false);
    setPartyId('');
    setItems([{ description: '', qty: 1, unitPrice: 0 }]);
    await onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> New {kind === 'SALE' ? 'sales' : 'purchase'} order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New {kind === 'SALE' ? 'sales' : 'purchase'} order</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{partyNoun}</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${partyNoun.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tax">Tax %</Label>
              <Input id="tax" type="number" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Line items</Label>
            <div className="mt-1 space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input className="flex-1" placeholder="Description" value={it.description} onChange={(e) => up(i, { description: e.target.value })} />
                  <Input type="number" className="w-16" placeholder="Qty" value={it.qty} onChange={(e) => up(i, { qty: Number(e.target.value) })} />
                  <Input type="number" className="w-28" placeholder="Unit price" value={it.unitPrice} onChange={(e) => up(i, { unitPrice: Number(e.target.value) })} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setItems((xs) => xs.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setItems((xs) => [...xs, { description: '', qty: 1, unitPrice: 0 }])}>
                <Plus className="h-3.5 w-3.5" /> Add line
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Subtotal {money(Math.round(subtotal))} + {taxPercent || 0}% tax</span>
            <span className="font-mono font-semibold">Total {money(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving || items.every((i) => !i.description.trim())}>
            {saving ? 'Saving…' : 'Create order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
