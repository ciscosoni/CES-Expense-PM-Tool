'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface Notif {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const DOT: Record<Notif['severity'], string> = {
  INFO: 'bg-primary',
  WARN: 'bg-warning',
  CRITICAL: 'bg-destructive',
};

export function NotificationBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const count = useQuery({
    queryKey: ['notif-count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30_000,
  });
  const list = useQuery({
    queryKey: ['notif-list'],
    queryFn: () => api.get<Notif[]>('/notifications'),
    enabled: open,
  });

  const unread = count.data?.count ?? 0;

  async function openItem(n: Notif) {
    if (!n.readAt) {
      await api.post(`/notifications/${n.id}/read`).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: ['notif-count'] });
      void qc.invalidateQueries({ queryKey: ['notif-list'] });
    }
    setOpen(false);
    if (n.linkPath) router.push(n.linkPath);
  }

  async function markAll() {
    await api.post('/notifications/read-all').catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['notif-count'] });
    void qc.invalidateQueries({ queryKey: ['notif-list'] });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground shadow-[0_0_8px_hsl(var(--glow)/0.8)]">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="glass absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
              <span className="text-sm font-semibold">Notifications</span>
              {unread > 0 && (
                <button
                  onClick={markAll}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Check className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[22rem] overflow-y-auto">
              {list.isLoading && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</p>
              )}
              {list.data?.length === 0 && (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  You&apos;re all caught up.
                </p>
              )}
              {list.data?.map((n) => (
                <button
                  key={n.id}
                  onClick={() => void openItem(n)}
                  className={cn(
                    'flex w-full gap-2.5 border-b border-border/40 px-3 py-2.5 text-left transition-colors hover:bg-accent/50',
                    !n.readAt && 'bg-primary/[0.04]',
                  )}
                >
                  <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : DOT[n.severity])} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium">{n.title}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                    </span>
                    {n.body && <span className="line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
