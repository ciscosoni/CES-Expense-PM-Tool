'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { Anomaly, AnomalyRule, AnomalySeverity } from '@/lib/types';

export default function AnomalyRulesPage() {
  const qc = useQueryClient();
  const rules = useQuery({
    queryKey: ['anomaly-rules'],
    queryFn: () => api.get<AnomalyRule[]>('/anomalies/rules'),
  });
  const open = useQuery({
    queryKey: ['anomalies', 'open'],
    queryFn: () => api.get<Anomaly[]>('/anomalies'),
  });

  const detect = useMutation({
    mutationFn: () => api.post<{ inserted: number; total: number }>('/anomalies/detect'),
    onSuccess: (r) => {
      toast.success(`Detector ran — ${r.inserted} new, ${r.total} open total`);
      void qc.invalidateQueries({ queryKey: ['anomalies'] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });

  const toggle = useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      api.patch(`/anomalies/rules/${vars.id}`, { enabled: vars.enabled }),
    onSuccess: () => {
      toast.success('Rule updated');
      void qc.invalidateQueries({ queryKey: ['anomaly-rules'] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });

  const setSeverity = useMutation({
    mutationFn: (vars: { id: string; severity: AnomalySeverity }) =>
      api.patch(`/anomalies/rules/${vars.id}`, { severity: vars.severity }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['anomaly-rules'] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });

  return (
    <AdminShell
      title="Anomaly rules"
      description="Admin-tunable detectors that flag suspicious or off-policy behavior. Disable a rule to suppress it without losing history."
      actions={
        <Button onClick={() => detect.mutate()} disabled={detect.isPending}>
          {detect.isPending ? 'Running…' : 'Run detector now'}
        </Button>
      }
    >
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Open anomalies</CardTitle>
          <CardDescription>
            Surfaces in the leadership dashboard. Resolve from there with a note.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {open.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {open.data?.length === 0 && (
            <p className="text-xs text-muted-foreground">All clear — no open anomalies.</p>
          )}
          {open.data && open.data.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {open.data.slice(0, 8).map((a) => (
                <div key={a.id} className="rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <SeverityBadge sev={a.severity} />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {a.kind.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{a.detail ?? '—'}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-64">Rule</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-28">Severity</TableHead>
              <TableHead className="w-28 text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.isLoading && <TableEmpty colSpan={4}>Loading…</TableEmpty>}
            {rules.data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {r.kind.replace(/_/g, ' ')}
                  </p>
                </TableCell>
                <TableCell className="text-sm">{r.description}</TableCell>
                <TableCell>
                  <Select
                    value={r.severity}
                    onValueChange={(v) =>
                      setSeverity.mutate({ id: r.id, severity: v as AnomalySeverity })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INFO">INFO</SelectItem>
                      <SelectItem value="WARN">WARN</SelectItem>
                      <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant={r.enabled ? 'default' : 'outline'}
                    onClick={() => toggle.mutate({ id: r.id, enabled: !r.enabled })}
                    disabled={toggle.isPending}
                  >
                    {r.enabled ? 'On' : 'Off'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}

function SeverityBadge({ sev }: { sev: AnomalySeverity }) {
  const map = {
    INFO: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
    WARN: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    CRITICAL: 'bg-red-500/15 text-red-600 border-red-500/30',
  } as const;
  return <Badge className={`border text-[10px] ${map[sev]}`}>{sev}</Badge>;
}
