'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError, api } from '@/lib/api';

type Band = 'WEAK' | 'MISSING';

interface FlaggedLog {
  id: string;
  date: string;
  userName: string;
  taskName: string;
  hours: number;
  notes: string | null;
  band: Band;
  reasons: string[];
  summary: string;
}

interface BillableReview {
  projectId: string;
  code: string;
  billingModel: string;
  totals: {
    billableLogs: number;
    billableHours: number;
    flaggedLogs: number;
    flaggedHours: number;
    solid: number;
    weak: number;
    missing: number;
  };
  flagged: FlaggedLog[];
}

type Verdict = 'BILLABLE' | 'NON_BILLABLE' | 'UNCLEAR';
interface BillableVerdict {
  verdict: Verdict;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

const BAND_TONE: Record<Band, string> = {
  MISSING: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  WEAK: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

const VERDICT_TONE: Record<Verdict, string> = {
  BILLABLE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  NON_BILLABLE: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  UNCLEAR: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

/**
 * Billable-justification review (P10 #3). Surfaces billable time whose note is
 * weak or missing — the hours a client disputes first. The per-row "Check (AI)"
 * is a suggest-only second opinion; nothing here changes billable status.
 */
export function BillableReviewPanel({ projectId }: { projectId: string }) {
  const [verdicts, setVerdicts] = React.useState<Record<string, BillableVerdict>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['billable-review', projectId],
    queryFn: () => api.get<BillableReview>(`/projects/${projectId}/billable-review`),
  });

  const classify = useMutation({
    mutationFn: (timeLogId: string) =>
      api.post<{ verdict: BillableVerdict; source: 'claude' | 'mock' }>('/ai/classify-billable', {
        timeLogId,
      }),
    onSuccess: (res, timeLogId) => setVerdicts((v) => ({ ...v, [timeLogId]: res.verdict })),
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : String(e)),
  });

  if (isLoading || !data) return null;
  if (data.totals.billableLogs === 0) return null;

  const { totals } = data;
  const clean = totals.flaggedLogs === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Billable hours at risk
        </CardTitle>
        <CardDescription>
          {totals.billableHours}h billed across {totals.billableLogs} logs ·{' '}
          {clean ? (
            <span className="text-emerald-700 dark:text-emerald-400">every entry has a solid justification</span>
          ) : (
            <span className="text-amber-700 dark:text-amber-300">
              {totals.flaggedHours}h ({totals.flaggedLogs} logs) with a weak or missing note — a client
              would dispute these first
            </span>
          )}
          . Justifications are scored locally; the per-row check is a suggest-only AI second opinion and
          never changes billable status.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {clean ? (
          <p className="flex items-center gap-2 px-6 pb-5 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Nothing to review.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Engineer</TableHead>
                <TableHead>Task / note</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Flag</TableHead>
                <TableHead>Billable?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.flagged.map((l) => {
                const v = verdicts[l.id];
                return (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{l.date}</TableCell>
                    <TableCell className="text-xs">{l.userName}</TableCell>
                    <TableCell className="max-w-[280px] text-xs">
                      <div className="font-medium">{l.taskName}</div>
                      <div className="truncate text-muted-foreground" title={l.notes ?? undefined}>
                        {l.notes?.trim() || <span className="italic">no note</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300/80">{l.summary}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{l.hours}</TableCell>
                    <TableCell>
                      <Badge className={`border text-[10px] ${BAND_TONE[l.band]}`}>{l.band}</Badge>
                    </TableCell>
                    <TableCell>
                      {v ? (
                        <span className="flex flex-col gap-0.5" title={v.reason}>
                          <Badge className={`border text-[10px] ${VERDICT_TONE[v.verdict]}`}>
                            {v.verdict.replace('_', '-')} · {v.confidence}
                          </Badge>
                          <span className="max-w-[200px] truncate text-[10px] text-muted-foreground">
                            {v.reason}
                          </span>
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          disabled={classify.isPending && classify.variables === l.id}
                          onClick={() => classify.mutate(l.id)}
                        >
                          {classify.isPending && classify.variables === l.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          Check (AI)
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
