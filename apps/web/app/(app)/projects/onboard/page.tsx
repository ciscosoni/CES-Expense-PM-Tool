'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardPaste,
  FileText,
  Loader2,
  Pencil,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { AiBadge } from '@/components/ai-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError, api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type {
  BillingModel,
  OnboardingCommitResponse,
  OnboardingGenerateResponse,
  OnboardingPlan,
  ProjectCategory,
} from '@/lib/types';

const SAMPLE_RFPS: Array<{ label: string; text: string }> = [
  {
    label: 'NTT — SBI DC ACI rollout',
    text: `From: vendor.management@ntt.in
Subject: SBI Mumbai DC — Cisco ACI rollout — RFP

Hi CES Team,

State Bank of India is consolidating their Mumbai BKC datacenter. NTT is the SI and we want CES to deliver the Cisco ACI fabric end-to-end under our brand (white-label). Scope:

- Low Level Design for spine-leaf fabric (2 spine + 6 leaf + 2 border-leaf), Cisco ACI 6.0
- Migration of ~80 existing tenants from legacy 7K
- Bridge-domain + VRF stitching with the DR site (Hyderabad)
- 24x7 hyper-care for 8 weeks post cutover
- Final hand-over with run-book

Budget: ₹45L all-inclusive (services only — HW comes from us)
Timeline: April – September 2026
Sign-off: 3 milestones — LLD (20%), fabric build + migration (60%), closure (20%)
Travel: Engineers will be on-site at Mumbai BKC; expect 60–70% on-site weeks for L3/L4 leads.

Need a project plan with team allocation by EOW.

Regards,
Rajiv Sharma
NTT Data — Networking Vertical`,
  },
  {
    label: 'Airtel — AAI airports SD-WAN',
    text: `Subject: AAI 40-airport SD-WAN refresh — engagement scope

Engagement Summary
==================
Client: Airtel Business
End customer: Airports Authority of India
Sites: 40 airports across 3 zones (North 15, West 12, South 13)
Solution: Fortinet SD-WAN with secure overlay back to AAI's Delhi + Hyderabad DCs
Engagement type: Milestone-based, ₹68L total, INR
Project window: May 2026 – Dec 2026

Waves
-----
- Pilot site (Delhi, 4 weeks): design + 1-site validation
- Wave 1 (Jun–Sep): 15 sites
- Wave 2 (Oct–Nov): 25 sites
- Closure + final docs: Dec

Resource needs
--------------
- 1 Tech lead (L4, full project)
- 2 senior engineers (L3, 50–60%)
- 1 junior for documentation + UAT support

Per-site travel is mandatory; engineers cycle in 2-week rotations. Per-diem and lodging within standard CES grade entitlements.

End customer expects fortnightly status decks. No HW supply on our side (Airtel handles).`,
  },
];

type WizardStep = 'input' | 'review' | 'committing' | 'done';

export default function OnboardWizardPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<WizardStep>('input');
  const [sourceText, setSourceText] = React.useState('');
  const [plan, setPlan] = React.useState<OnboardingPlan | null>(null);
  const [source, setSource] = React.useState<'claude' | 'mock' | null>(null);

  const generate = useMutation({
    mutationFn: (text: string) =>
      api.post<OnboardingGenerateResponse>('/ai/project-onboard/generate', {
        sourceText: text,
      }),
    onSuccess: (data) => {
      setPlan(data.plan);
      setSource(data.source);
      setStep('review');
      toast.success(
        data.source === 'claude' ? 'Claude drafted your plan' : 'Mock plan ready for review',
      );
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });

  const commit = useMutation({
    mutationFn: (p: OnboardingPlan) =>
      api.post<OnboardingCommitResponse>('/ai/project-onboard/commit', { plan: p }),
    onSuccess: (res) => {
      toast.success(`Project ${res.code} created with ${res.taskCount} tasks`);
      setStep('done');
      setTimeout(() => router.push(`/projects/${res.id}`), 800);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError ? e.message : String(e));
      setStep('review');
    },
  });

  return (
    <AdminShell
      title={
        <span className="flex items-center gap-2">
          AI Project Onboarding
          <AiBadge label="Claude" />
        </span>
      }
      description="Paste an RFP, email thread, or SOW. Claude drafts a project, milestones, tasks, and a team — you review and one-click commit."
    >
      <Stepper step={step} />

      <div className="mt-6">
        {step === 'input' && (
          <InputStep
            sourceText={sourceText}
            onSourceTextChange={setSourceText}
            onGenerate={() => generate.mutate(sourceText)}
            generating={generate.isPending}
          />
        )}
        {step === 'review' && plan && (
          <ReviewStep
            plan={plan}
            source={source!}
            onPlanChange={setPlan}
            onBack={() => setStep('input')}
            onCommit={() => {
              setStep('committing');
              commit.mutate(plan);
            }}
            committing={commit.isPending}
          />
        )}
        {step === 'committing' && (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--ai-via))]" />
            <p className="text-sm text-muted-foreground">
              Creating project, milestones, tasks, allocations, and baseline snapshot…
            </p>
          </div>
        )}
        {step === 'done' && (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15">
              <Check className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="text-sm">Done. Redirecting to your new project…</p>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

// =====================================================================
// Stepper
// =====================================================================

function Stepper({ step }: { step: WizardStep }) {
  const items: { id: WizardStep; label: string; icon: React.ReactNode }[] = [
    { id: 'input', label: 'Paste source', icon: <ClipboardPaste className="h-3.5 w-3.5" /> },
    { id: 'review', label: 'Review plan', icon: <Pencil className="h-3.5 w-3.5" /> },
    { id: 'committing', label: 'Commit', icon: <Check className="h-3.5 w-3.5" /> },
  ];
  const activeIdx = items.findIndex((i) => i.id === step);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {items.map((it, i) => {
        const done = activeIdx > i;
        const active = activeIdx === i;
        return (
          <React.Fragment key={it.id}>
            <li className="flex items-center gap-1.5">
              <span
                className={
                  'grid h-6 w-6 place-items-center rounded-full border text-[10px] ' +
                  (done
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-500'
                    : active
                      ? 'border-[hsl(var(--ai-via))]/40 bg-[hsl(var(--ai-via))]/15 text-[hsl(var(--ai-via))]'
                      : 'border-border bg-secondary text-muted-foreground')
                }
              >
                {done ? <Check className="h-3 w-3" /> : it.icon}
              </span>
              <span
                className={
                  active ? 'font-semibold' : done ? 'text-muted-foreground' : 'text-muted-foreground/60'
                }
              >
                {it.label}
              </span>
            </li>
            {i < items.length - 1 && (
              <li className="h-px w-8 bg-border" aria-hidden />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

// =====================================================================
// Step 1 — Input
// =====================================================================

function InputStep({
  sourceText,
  onSourceTextChange,
  onGenerate,
  generating,
}: {
  sourceText: string;
  onSourceTextChange: (s: string) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const tooShort = sourceText.trim().length < 40;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card tone="ai" className="overflow-hidden">
        <CardHeader className="border-b border-border/40">
          <CardDescription className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Step 1 · Source material
          </CardDescription>
          <CardTitle className="text-base">
            Paste an RFP, email thread, SOW, BOQ, or meeting notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-5">
          <Textarea
            rows={18}
            placeholder="Paste anywhere from a 2-line ask to a 5-page SOW. Claude will pull out the project name, client, scope, milestones, tasks, and the team that should run it…"
            value={sourceText}
            onChange={(e) => onSourceTextChange(e.target.value)}
            className="min-h-[420px] font-mono text-[12px] leading-relaxed"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {sourceText.length.toLocaleString()} chars
              {tooShort && sourceText.length > 0 && (
                <span className="ml-2 text-amber-500">need ≥ 40 chars</span>
              )}
            </p>
            <Button
              size="lg"
              onClick={onGenerate}
              disabled={tooShort || generating}
              className="bg-gradient-to-r from-[hsl(var(--ai-from))] via-[hsl(var(--ai-via))] to-[hsl(var(--ai-to))] text-white shadow-lg hover:opacity-90"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Drafting plan…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Generate with Claude
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <FileText className="h-3 w-3" /> Quick start
            </CardDescription>
            <CardTitle className="text-sm">Try a sample</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {SAMPLE_RFPS.map((s) => (
              <Button
                key={s.label}
                variant="outline"
                size="sm"
                className="w-full justify-between text-left"
                onClick={() => onSourceTextChange(s.text)}
              >
                <span className="truncate">{s.label}</span>
                <ArrowRight className="h-3 w-3 shrink-0 opacity-50" />
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card tone="ai">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> What Claude does
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <FeatureRow
                icon={<FileText className="h-3.5 w-3.5 text-[hsl(var(--ai-via))]" />}
                title="Extracts deal shape"
                detail="Client, end customer, white-label, category, billing model, dates, value."
              />
              <FeatureRow
                icon={<Pencil className="h-3.5 w-3.5 text-[hsl(var(--ai-via))]" />}
                title="Drafts milestones + tasks"
                detail="Realistic split + per-task hours mapped to grade bands."
              />
              <FeatureRow
                icon={<Users className="h-3.5 w-3.5 text-[hsl(var(--ai-via))]" />}
                title="Aligns the team"
                detail="Pulls from your people directory; respects current month utilization."
              />
              <FeatureRow
                icon={<TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--ai-via))]" />}
                title="Forecasts P&amp;L + optimizations"
                detail="Revenue / cost / margin with concrete cost-down suggestions."
              />
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5">{icon}</span>
      <div>
        <p className="text-[12px] font-medium text-foreground">{title}</p>
        <p className="text-[11px]">{detail}</p>
      </div>
    </li>
  );
}

// =====================================================================
// Step 2 — Review
// =====================================================================

function ReviewStep({
  plan,
  source,
  onPlanChange,
  onBack,
  onCommit,
  committing,
}: {
  plan: OnboardingPlan;
  source: 'claude' | 'mock';
  onPlanChange: (p: OnboardingPlan) => void;
  onBack: () => void;
  onCommit: () => void;
  committing: boolean;
}) {
  const update = <K extends keyof OnboardingPlan>(key: K, value: OnboardingPlan[K]) =>
    onPlanChange({ ...plan, [key]: value });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {source === 'claude' ? (
            <Badge className="border-[hsl(var(--ai-via))]/40 bg-[hsl(var(--ai-via))]/10 text-[hsl(var(--ai-via))]">
              Drafted by Claude
            </Badge>
          ) : (
            <Badge variant="outline">Mock plan — set ANTHROPIC_API_KEY for real AI</Badge>
          )}
          <span>Every field is editable. Commit when you&apos;re happy.</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack} disabled={committing}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <Button
            size="sm"
            onClick={onCommit}
            disabled={committing}
            className="bg-gradient-to-r from-[hsl(var(--ai-from))] via-[hsl(var(--ai-via))] to-[hsl(var(--ai-to))] text-white shadow-lg hover:opacity-90"
          >
            {committing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Commit project
          </Button>
        </div>
      </div>

      {/* Header KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard
          label="Contract value"
          value={formatMoney(plan.contractValue, plan.currency)}
          accent="positive"
        />
        <KpiCard
          label="Internal budget"
          value={formatMoney(plan.budget, plan.currency)}
          accent="muted"
        />
        <KpiCard
          label="Forecast margin"
          value={`${plan.marginForecast.marginPercent.toFixed(1)}%`}
          accent={plan.marginForecast.marginPercent >= 30 ? 'positive' : 'amber'}
        />
        <KpiCard
          label="Team"
          value={`${plan.teamSuggestions.length} people`}
          accent="primary"
        />
      </div>

      {/* Core fields + scope */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project</CardTitle>
          <CardDescription>Identification + billing</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Field label="Name" wide>
            <Input
              value={plan.projectName}
              onChange={(e) => update('projectName', e.target.value)}
            />
          </Field>
          <Field label="Code">
            <Input
              value={plan.suggestedCode}
              onChange={(e) => update('suggestedCode', e.target.value)}
            />
          </Field>
          <Field label="Client">
            <Input
              value={plan.clientName}
              onChange={(e) => update('clientName', e.target.value)}
            />
          </Field>
          <Field label="End customer">
            <Input
              value={plan.endCustomerName ?? ''}
              placeholder="(optional)"
              onChange={(e) =>
                update('endCustomerName', e.target.value.trim() === '' ? null : e.target.value)
              }
            />
          </Field>
          <Field label="Category">
            <Select
              value={plan.category}
              onValueChange={(v) => update('category', v as ProjectCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACI">ACI</SelectItem>
                <SelectItem value="NON_ACI">Non-ACI</SelectItem>
                <SelectItem value="SD_WAN">SD-WAN</SelectItem>
                <SelectItem value="SECURITY">Security</SelectItem>
                <SelectItem value="AUDIT">Audit</SelectItem>
                <SelectItem value="MANAGED_SERVICES">Managed Services</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Billing model">
            <Select
              value={plan.billingModel}
              onValueChange={(v) => update('billingModel', v as BillingModel)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIXED_PRICE">Fixed price</SelectItem>
                <SelectItem value="T_AND_M">T&amp;M</SelectItem>
                <SelectItem value="MILESTONE">Milestone</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Contract value">
            <Input
              value={plan.contractValue}
              onChange={(e) => update('contractValue', e.target.value)}
            />
          </Field>
          <Field label="Currency">
            <Input
              value={plan.currency}
              onChange={(e) => update('currency', e.target.value.toUpperCase())}
              maxLength={3}
            />
          </Field>
          <Field label="Budget (internal)">
            <Input value={plan.budget} onChange={(e) => update('budget', e.target.value)} />
          </Field>
          <Field label="Planned start">
            <Input
              type="date"
              value={plan.plannedStart}
              onChange={(e) => update('plannedStart', e.target.value)}
            />
          </Field>
          <Field label="Planned end">
            <Input
              type="date"
              value={plan.plannedEnd}
              onChange={(e) => update('plannedEnd', e.target.value)}
            />
          </Field>
          <Field label="White-label">
            <Button
              variant={plan.whiteLabel ? 'default' : 'outline'}
              onClick={() => update('whiteLabel', !plan.whiteLabel)}
              size="sm"
              className="w-full"
            >
              {plan.whiteLabel ? 'On' : 'Off'}
            </Button>
          </Field>
          <Field label="Scope summary" wide>
            <Textarea
              rows={3}
              value={plan.scopeSummary}
              onChange={(e) => update('scopeSummary', e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Milestones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Milestones</CardTitle>
          <CardDescription>
            Sum should equal contract value · {formatMoney(plan.contractValue, plan.currency)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {plan.milestones.map((m, idx) => (
            <div key={idx} className="grid items-end gap-2 md:grid-cols-[1fr_140px_140px_auto]">
              <Field label={idx === 0 ? 'Name' : ''}>
                <Input
                  value={m.name}
                  onChange={(e) => {
                    const next = [...plan.milestones];
                    next[idx] = { ...m, name: e.target.value };
                    update('milestones', next);
                  }}
                />
              </Field>
              <Field label={idx === 0 ? 'Value' : ''}>
                <Input
                  value={m.value}
                  onChange={(e) => {
                    const next = [...plan.milestones];
                    next[idx] = { ...m, value: e.target.value };
                    update('milestones', next);
                  }}
                />
              </Field>
              <Field label={idx === 0 ? 'Planned date' : ''}>
                <Input
                  type="date"
                  value={m.plannedDate}
                  onChange={(e) => {
                    const next = [...plan.milestones];
                    next[idx] = { ...m, plannedDate: e.target.value };
                    update('milestones', next);
                  }}
                />
              </Field>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  update(
                    'milestones',
                    plan.milestones.filter((_, i) => i !== idx),
                  );
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              update('milestones', [
                ...plan.milestones,
                {
                  name: 'New milestone',
                  value: '0',
                  plannedDate: plan.plannedEnd,
                },
              ])
            }
          >
            + Add milestone
          </Button>
          <MilestoneSumHint plan={plan} />
        </CardContent>
      </Card>

      {/* Tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasks</CardTitle>
          <CardDescription>
            {plan.tasks.length} tasks · {plan.tasks.reduce((a, b) => a + b.estimatedHours, 0)} total
            hours
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1 text-left">Name</th>
                  <th className="py-1 text-left">Phase</th>
                  <th className="py-1 text-right">Hours</th>
                  <th className="py-1 text-left">Grade</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {plan.tasks.map((t, idx) => (
                  <tr key={idx}>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={t.name}
                        onChange={(e) => {
                          const next = [...plan.tasks];
                          next[idx] = { ...t, name: e.target.value };
                          update('tasks', next);
                        }}
                        className="h-7"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={t.phase ?? ''}
                        onChange={(e) => {
                          const next = [...plan.tasks];
                          next[idx] = { ...t, phase: e.target.value };
                          update('tasks', next);
                        }}
                        className="h-7"
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <Input
                        type="number"
                        value={t.estimatedHours}
                        onChange={(e) => {
                          const next = [...plan.tasks];
                          next[idx] = {
                            ...t,
                            estimatedHours: Math.max(0, parseInt(e.target.value, 10) || 0),
                          };
                          update('tasks', next);
                        }}
                        className="h-7 text-right"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Select
                        value={t.suggestedGradeCode ?? ''}
                        onValueChange={(v) => {
                          const next = [...plan.tasks];
                          next[idx] = {
                            ...t,
                            suggestedGradeCode: v as 'L1' | 'L2' | 'L3' | 'L4' | 'L5',
                          };
                          update('tasks', next);
                        }}
                      >
                        <SelectTrigger className="h-7 w-20">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {['L1', 'L2', 'L3', 'L4', 'L5'].map((g) => (
                            <SelectItem key={g} value={g}>
                              {g}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          update(
                            'tasks',
                            plan.tasks.filter((_, i) => i !== idx),
                          );
                        }}
                      >
                        ✕
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() =>
              update('tasks', [
                ...plan.tasks,
                { name: 'New task', estimatedHours: 8, suggestedGradeCode: 'L3' },
              ])
            }
          >
            + Add task
          </Button>
        </CardContent>
      </Card>

      {/* Team + Optimization */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team allocation</CardTitle>
            <CardDescription>
              Pulled from your people directory; check rationale for utilization context.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {plan.teamSuggestions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Claude didn&apos;t suggest a team for this plan. Add people from /admin/users after
                committing.
              </p>
            )}
            {plan.teamSuggestions.map((t, idx) => (
              <div
                key={idx}
                className="rounded-md border bg-background/40 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{t.userEmail}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {t.role}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-[1fr_100px_auto] items-center gap-2">
                  <p className="text-muted-foreground">
                    {t.rationale ?? '(no rationale)'}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      value={t.percentAllocation}
                      min={5}
                      max={100}
                      onChange={(e) => {
                        const next = [...plan.teamSuggestions];
                        next[idx] = {
                          ...t,
                          percentAllocation: Math.min(
                            100,
                            Math.max(5, parseInt(e.target.value, 10) || 5),
                          ),
                        };
                        update('teamSuggestions', next);
                      }}
                      className="h-7 w-16"
                    />
                    <span className="text-[10px] uppercase text-muted-foreground">%</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      update(
                        'teamSuggestions',
                        plan.teamSuggestions.filter((_, i) => i !== idx),
                      );
                    }}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
            <AddTeamMember
              onAdd={(email) =>
                update('teamSuggestions', [
                  ...plan.teamSuggestions,
                  {
                    userEmail: email,
                    role: 'Engineer',
                    percentAllocation: 50,
                    rationale: 'Added manually during review.',
                  },
                ])
              }
            />
          </CardContent>
        </Card>

        <Card tone="ai">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Optimization ideas
            </CardDescription>
            <CardTitle className="text-base">How to make this project better</CardTitle>
          </CardHeader>
          <CardContent>
            {plan.risks.summary && (
              <p className="mb-3 text-xs text-muted-foreground">{plan.risks.summary}</p>
            )}
            <ul className="space-y-2">
              {plan.risks.optimizationOpportunities.map((o, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[hsl(var(--ai-via))]/15 text-[10px] text-[hsl(var(--ai-via))]">
                    {idx + 1}
                  </span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-md border border-border/40 bg-background/40 p-3 text-xs">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Forecast P&amp;L
              </p>
              <div className="grid grid-cols-4 gap-2 font-mono">
                <div>
                  <p className="text-[10px] text-muted-foreground">Revenue</p>
                  <p>{formatMoney(plan.marginForecast.revenue, plan.currency)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Cost</p>
                  <p>{formatMoney(plan.marginForecast.cost, plan.currency)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">GP</p>
                  <p>{formatMoney(plan.marginForecast.grossProfit, plan.currency)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Margin</p>
                  <p
                    className={
                      plan.marginForecast.marginPercent >= 30
                        ? 'text-emerald-500'
                        : plan.marginForecast.marginPercent >= 15
                          ? 'text-amber-500'
                          : 'text-red-500'
                    }
                  >
                    {plan.marginForecast.marginPercent.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sticky commit */}
      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-2 rounded-xl border border-border/60 bg-card/95 p-3 shadow-xl backdrop-blur">
        <Button variant="outline" onClick={onBack} disabled={committing}>
          <ArrowLeft className="h-4 w-4" /> Back to source
        </Button>
        <Button
          onClick={onCommit}
          disabled={committing}
          className="bg-gradient-to-r from-[hsl(var(--ai-from))] via-[hsl(var(--ai-via))] to-[hsl(var(--ai-to))] text-white shadow-lg hover:opacity-90"
        >
          {committing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Commit project
        </Button>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'positive' | 'amber' | 'primary' | 'muted';
}) {
  const cls =
    accent === 'positive'
      ? 'text-emerald-400'
      : accent === 'amber'
        ? 'text-amber-400'
        : accent === 'primary'
          ? 'text-[hsl(var(--ai-via))]'
          : 'text-foreground';
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`font-mono text-2xl ${cls}`}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`space-y-1.5 ${wide ? 'md:col-span-3' : ''}`}>
      {label && <Label className="text-[10px] uppercase tracking-wider">{label}</Label>}
      {children}
    </div>
  );
}

function MilestoneSumHint({ plan }: { plan: OnboardingPlan }) {
  const sum = plan.milestones.reduce((acc, m) => acc + Number(m.value || 0), 0);
  const target = Number(plan.contractValue || 0);
  const diff = sum - target;
  const ok = Math.abs(diff) < 0.5;
  return (
    <p className={`text-xs ${ok ? 'text-emerald-500' : 'text-amber-500'}`}>
      Sum of milestones: {formatMoney(sum.toFixed(2), plan.currency)} ·{' '}
      {ok ? 'matches contract value' : `differs from contract by ${formatMoney(diff.toFixed(2), plan.currency)}`}
    </p>
  );
}

function AddTeamMember({ onAdd }: { onAdd: (email: string) => void }) {
  const [email, setEmail] = React.useState('');
  return (
    <div className="flex items-center gap-2 pt-2">
      <Input
        placeholder="Add by email (e.g. engineer@cestech.in)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-8 text-xs"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!email.includes('@')}
        onClick={() => {
          onAdd(email);
          setEmail('');
        }}
      >
        Add
      </Button>
    </div>
  );
}
