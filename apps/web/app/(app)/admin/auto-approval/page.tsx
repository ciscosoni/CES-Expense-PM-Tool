'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Play, ShieldCheck } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ApiError, api } from '@/lib/api';

interface Policy {
  id: string;
  enabled: boolean;
  autoApprove: boolean;
  maxAmount: string;
  currency: string;
  requireReceipt: boolean;
  requireNoFlags: boolean;
}

interface RunResult {
  autoApprove: boolean;
  evaluated: number;
  approved: number;
}

export default function AutoApprovalAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['auto-approval', 'policy'],
    queryFn: () => api.get<Policy>('/agents/auto-approval/policy'),
  });

  const [form, setForm] = React.useState<Policy | null>(null);
  React.useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (p: Policy) =>
      api.put<Policy>('/agents/auto-approval/policy', {
        enabled: p.enabled,
        autoApprove: p.autoApprove,
        maxAmount: p.maxAmount,
        currency: p.currency,
        requireReceipt: p.requireReceipt,
        requireNoFlags: p.requireNoFlags,
      }),
    onSuccess: () => {
      toast.success('Policy saved');
      void qc.invalidateQueries({ queryKey: ['auto-approval', 'policy'] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });

  const run = useMutation({
    mutationFn: () => api.post<RunResult>('/agents/auto-approval/run', {}),
    onSuccess: (r) => {
      toast.success(
        r.autoApprove
          ? `Auto-approved ${r.approved} of ${r.evaluated} submitted expense(s) through the owner step`
          : 'Auto-approval is off — nothing was changed',
      );
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });

  if (isLoading || !form) {
    return (
      <AdminShell title="Auto-approval">
        <div className="flex items-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading policy…
        </div>
      </AdminShell>
    );
  }

  const set = <K extends keyof Policy>(key: K, value: Policy[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <AdminShell
      title="Auto-approval"
      description="Let clean, in-policy expenses clear the owner step automatically — Finance still reviews every payout."
    >
      <div className="max-w-2xl space-y-6">
        {/* Kill switch */}
        <Card tone={form.autoApprove ? 'ai' : 'default'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-[hsl(var(--ai-via))]" /> Confident auto-approval
            </CardTitle>
            <CardDescription>
              When ON, expenses that pass the policy below auto-advance{' '}
              <span className="font-medium text-foreground">SUBMITTED → OWNER_APPROVED</span> only. Finance
              still does the final human review, so no money becomes payable without a person. Every
              auto-action is written to the audit log as a system action. Default is OFF (suggest-only).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Label htmlFor="autoApprove" className="text-sm">
              Auto-approve clean expenses (owner step)
            </Label>
            <Switch
              id="autoApprove"
              checked={form.autoApprove}
              onCheckedChange={(v) => set('autoApprove', v)}
            />
          </CardContent>
        </Card>

        {/* Eligibility policy */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eligibility policy</CardTitle>
            <CardDescription>
              The same rule decides both the suggest-only badges and confident auto-approval. Deterministic
              — no AI in the loop.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="maxAmount">Max amount</Label>
                <Input
                  id="maxAmount"
                  value={form.maxAmount}
                  onChange={(e) => set('maxAmount', e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  value={form.currency}
                  maxLength={3}
                  onChange={(e) => set('currency', e.target.value.toUpperCase())}
                />
              </div>
            </div>
            <ToggleRow
              label="Require an attached receipt"
              checked={form.requireReceipt}
              onChange={(v) => set('requireReceipt', v)}
            />
            <ToggleRow
              label="Require no fraud flags (dup / GPS / amount / date)"
              checked={form.requireNoFlags}
              onChange={(v) => set('requireNoFlags', v)}
            />
            <ToggleRow
              label="Surface suggest-only badges in the approval inbox"
              checked={form.enabled}
              onChange={(v) => set('enabled', v)}
            />
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save policy
          </Button>
          <Button
            variant="outline"
            onClick={() => run.mutate()}
            disabled={run.isPending || !data?.autoApprove}
            title={data?.autoApprove ? 'Run now' : 'Enable and save auto-approval first'}
          >
            {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run now
          </Button>
          {!data?.autoApprove && (
            <span className="text-xs text-muted-foreground">Save with auto-approve ON to run.</span>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm font-normal text-muted-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
