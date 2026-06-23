'use client';

import * as React from 'react';
import { Plus, Sparkles, ArrowRight, Trophy } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { formatMoney } from '@/lib/format';

export type Stage =
  | 'GENERATED'
  | 'QUALIFIED'
  | 'INITIAL_CONTACT'
  | 'SCHEDULE_APPOINTMENT'
  | 'PROPOSAL_SENT'
  | 'WIN'
  | 'LOST';

const STAGES: Stage[] = [
  'GENERATED',
  'QUALIFIED',
  'INITIAL_CONTACT',
  'SCHEDULE_APPOINTMENT',
  'PROPOSAL_SENT',
  'WIN',
  'LOST',
];
const LABEL: Record<Stage, string> = {
  GENERATED: 'Generated',
  QUALIFIED: 'Qualified',
  INITIAL_CONTACT: 'Initial contact',
  SCHEDULE_APPOINTMENT: 'Appointment',
  PROPOSAL_SENT: 'Proposal sent',
  WIN: 'Won',
  LOST: 'Lost',
};

interface Lead {
  id: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  stage: Stage;
  value: number | null;
  currency: string;
  source: string | null;
  category: string | null;
  owner: { id: string; displayName: string } | null;
  convertedClientId: string | null;
  score: number;
  nextAction: string;
  reasons: string[];
}
interface Column {
  stage: Stage;
  count: number;
  value: number;
  items: Lead[];
}
export interface Board {
  columns: Column[];
  summary: { total: number; open: number; won: number; openValue: number; wonValue: number };
}

function scoreTone(score: number): string {
  if (score >= 70) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (score >= 40) return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-border bg-secondary text-muted-foreground';
}

export function LeadsBoard({ initial }: { initial: Board | null }) {
  const [board, setBoard] = React.useState<Board | null>(initial);
  const [loading, setLoading] = React.useState(!initial);
  const [busy, setBusy] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const r = await fetch('/api/leads/board', { cache: 'no-store' });
    if (r.ok) setBoard((await r.json()) as Board);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    if (!initial) void refresh();
  }, [initial, refresh]);

  async function move(id: string, stage: Stage) {
    let lostReason: string | undefined;
    if (stage === 'LOST') {
      const reason = window.prompt('Reason for marking this lead Lost?');
      if (!reason) return;
      lostReason = reason;
    }
    setBusy(id);
    await fetch(`/api/leads/${id}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, lostReason }),
    });
    await refresh();
    setBusy(null);
  }

  async function convert(id: string) {
    setBusy(id);
    await fetch(`/api/leads/${id}/convert`, { method: 'POST' });
    await refresh();
    setBusy(null);
  }

  const s = board?.summary;

  return (
    <AdminShell
      title="Leads"
      description={
        s
          ? `${s.open} open · ${formatMoney(String(s.openValue))} in pipeline · ${s.won} won (${formatMoney(String(s.wonValue))})`
          : 'Sales pipeline'
      }
      actions={<NewLeadDialog onCreated={refresh} />}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading pipeline…</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const col = board?.columns.find((c) => c.stage === stage);
            const items = col?.items ?? [];
            return (
              <div key={stage} className="flex w-72 shrink-0 flex-col">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {stage === 'WIN' && <Trophy className="h-3 w-3 text-emerald-500" />}
                    {LABEL[stage]}
                    <span className="rounded bg-secondary px-1.5 font-mono text-foreground">{items.length}</span>
                  </span>
                  {col && col.value > 0 && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatMoney(String(col.value))}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {items.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-[11px] text-muted-foreground">
                      Empty
                    </div>
                  )}
                  {items.map((l, i) => (
                    <Card
                      key={l.id}
                      interactive
                      className="reveal p-3"
                      style={{ ['--i' as string]: i }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{l.companyName}</p>
                        <Badge className={`border text-[9px] ${scoreTone(l.score)}`} title={l.reasons.join(' · ')}>
                          {l.score}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        {l.value != null && <span className="font-mono text-foreground">{formatMoney(String(l.value), l.currency)}</span>}
                        {l.category && <span>· {l.category}</span>}
                        {l.contactName && <span>· {l.contactName}</span>}
                      </div>
                      <p className="mt-2 flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
                        <Sparkles className="mt-px h-3 w-3 shrink-0 text-[hsl(var(--ai-via))]" />
                        {l.nextAction}
                      </p>
                      <div className="mt-2.5 flex items-center gap-1.5">
                        {l.stage === 'WIN' && !l.convertedClientId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 flex-1 text-[11px]"
                            disabled={busy === l.id}
                            onClick={() => convert(l.id)}
                          >
                            <ArrowRight className="h-3 w-3" /> Convert to client
                          </Button>
                        ) : l.convertedClientId ? (
                          <Badge variant="success" dot className="text-[9px]">
                            Client created
                          </Badge>
                        ) : (
                          <Select value={l.stage} onValueChange={(v) => move(l.id, v as Stage)}>
                            <SelectTrigger className="h-7 text-[11px]" disabled={busy === l.id}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map((st) => (
                                <SelectItem key={st} value={st} className="text-xs">
                                  {LABEL[st]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}

function NewLeadDialog({ onCreated }: { onCreated: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    companyName: '',
    contactName: '',
    value: '',
    category: '',
    source: '',
    stage: 'GENERATED' as Stage,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!form.companyName.trim()) return;
    setSaving(true);
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: form.companyName.trim(),
        contactName: form.contactName.trim() || undefined,
        value: form.value ? Number(form.value) : undefined,
        category: form.category.trim() || undefined,
        source: form.source.trim() || undefined,
        stage: form.stage,
      }),
    });
    setSaving(false);
    setOpen(false);
    setForm({ companyName: '', contactName: '', value: '', category: '', source: '', stage: 'GENERATED' });
    await onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> New lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="co">Company *</Label>
            <Input id="co" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="e.g. Axis Bank — DC Refresh" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="contact">Contact</Label>
              <Input id="contact" value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="value">Deal value (₹)</Label>
              <Input id="value" type="number" value={form.value} onChange={(e) => set('value', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cat">Category</Label>
              <Input id="cat" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="ACI, SD-WAN…" />
            </div>
            <div>
              <Label htmlFor="src">Source</Label>
              <Input id="src" value={form.source} onChange={(e) => set('source', e.target.value)} placeholder="Referral, NTT…" />
            </div>
          </div>
          <div>
            <Label>Stage</Label>
            <Select value={form.stage} onValueChange={(v) => set('stage', v as Stage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {LABEL[st]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving || !form.companyName.trim()}>
            {saving ? 'Saving…' : 'Create lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
