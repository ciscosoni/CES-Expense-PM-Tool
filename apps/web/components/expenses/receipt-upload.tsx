'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Paperclip, ShieldCheck, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ApiError, api } from '@/lib/api';
import type { Receipt, ReceiptFlag, ReceiptFlagSeverity } from '@/lib/types';

const SEVERITY_COLOR: Record<ReceiptFlagSeverity, string> = {
  INFO: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  WARN: 'bg-amber-100 text-amber-700 border-amber-200',
  BLOCK: 'bg-red-100 text-red-700 border-red-200',
};

export function ReceiptUpload({ expenseId }: { expenseId: string }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const receipts = useQuery({
    queryKey: ['receipts', expenseId],
    queryFn: () => api.get<Receipt[]>(`/expenses/${expenseId}/receipts`),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      const fileBase64 = arrayBufferToBase64(buf);
      return api.post<Receipt>('/receipts', {
        expenseId,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        fileBase64,
      });
    },
    onSuccess: (created: Receipt) => {
      void qc.invalidateQueries({ queryKey: ['receipts', expenseId] });
      const blocked = created.flags.some((f) => f.severity === 'BLOCK');
      if (blocked) {
        toast.error('Receipt uploaded — flagged as BLOCK by anti-fraud (see details).');
      } else if (created.flags.length > 0) {
        toast.warning(`Receipt uploaded with ${created.flags.length} flag(s).`);
      } else {
        toast.success('Receipt uploaded — no anti-fraud flags.');
      }
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/receipts/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['receipts', expenseId] });
      toast.success('Receipt removed');
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload.mutate(f);
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
      >
        <Upload className="h-3.5 w-3.5" />
        {upload.isPending ? 'Uploading…' : 'Attach receipt'}
      </Button>

      {receipts.data && receipts.data.length > 0 && (
        <ul className="space-y-2 text-sm">
          {receipts.data.map((r) => (
            <li key={r.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate text-xs font-mono">{r.fileUrl}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    SHA-256 {r.contentHash.slice(0, 12)}…{r.contentHash.slice(-6)} · {r.contentType}
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => remove.mutate(r.id)}>
                  Remove
                </Button>
              </div>
              {r.flags.length === 0 ? (
                <div className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> No anti-fraud flags
                </div>
              ) : (
                <ul className="mt-2 space-y-1">
                  {r.flags.map((f: ReceiptFlag) => (
                    <li
                      key={f.id}
                      className={`inline-flex items-start gap-1 rounded-sm border px-2 py-1 text-xs ${SEVERITY_COLOR[f.severity]}`}
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
                      <span>
                        <Badge className="mr-1 text-[9px]" variant="outline">
                          {f.severity}
                        </Badge>
                        <strong>{f.kind.replace(/_/g, ' ')}</strong>
                        {f.detail && <span className="block opacity-80">{f.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
