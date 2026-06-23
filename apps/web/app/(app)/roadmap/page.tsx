import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { serverFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  client: { id: string; name: string } | null;
}

const STATUS_BAR: Record<string, string> = {
  DRAFT: 'bg-muted-foreground/40',
  ACTIVE: 'bg-primary',
  ON_HOLD: 'bg-amber-500',
  CLOSED: 'bg-emerald-500',
  CANCELLED: 'bg-red-500/50',
};
const FILTERS = ['ALL', 'ACTIVE', 'DRAFT', 'ON_HOLD', 'CLOSED'] as const;

function ms(d: string | null): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
}

export default async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const filter = (sp.status ?? 'ALL').toUpperCase();
  const all = await serverFetch<ProjectRow[]>('/projects').catch(() => [] as ProjectRow[]);
  const projects = filter === 'ALL' ? all : all.filter((p) => p.status === filter);

  const dated = projects
    .map((p) => ({ ...p, s: ms(p.plannedStart), e: ms(p.plannedEnd) }))
    .filter((p) => p.s !== null && p.e !== null && (p.e as number) >= (p.s as number))
    .sort((a, b) => (a.s as number) - (b.s as number));

  const undatedCount = projects.length - dated.length;

  const min = dated.length ? Math.min(...dated.map((p) => p.s as number)) : 0;
  const max = dated.length ? Math.max(...dated.map((p) => p.e as number)) : 1;
  const span = Math.max(1, max - min);
  const pct = (t: number) => ((t - min) / span) * 100;

  // Quarter ticks across the span.
  const ticks: { label: string; left: number }[] = [];
  if (dated.length) {
    const start = new Date(min);
    let y = start.getFullYear();
    let q = Math.floor(start.getMonth() / 3);
    for (let i = 0; i < 24; i++) {
      const tickMs = new Date(y, q * 3, 1).getTime();
      if (tickMs > max) break;
      if (tickMs >= min) ticks.push({ label: `Q${q + 1} '${String(y).slice(2)}`, left: pct(tickMs) });
      q++;
      if (q > 3) {
        q = 0;
        y++;
      }
    }
  }

  return (
    <AdminShell
      title="Roadmap"
      description={`${dated.length} projects on the timeline${undatedCount ? ` · ${undatedCount} without dates` : ''}`}
      actions={
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={f === 'ALL' ? '/roadmap' : `/roadmap?status=${f}`}
              className={`rounded-md border px-2 py-1 font-medium transition-colors ${filter === f ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground hover:text-foreground'}`}
            >
              {f === 'ALL' ? 'All' : f[0] + f.slice(1).toLowerCase().replace('_', ' ')}
            </Link>
          ))}
        </div>
      }
    >
      <Card className="overflow-hidden p-0">
        {dated.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No dated projects in this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Timeline header */}
              <div className="relative ml-64 h-7 border-b border-border/60">
                {ticks.map((t) => (
                  <div
                    key={t.label}
                    className="absolute top-0 flex h-full items-center border-l border-border/50 pl-1 text-[10px] text-muted-foreground"
                    style={{ left: `${t.left}%` }}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
              {/* Rows */}
              <div className="divide-y divide-border/40">
                {dated.map((p) => (
                  <div key={p.id} className="flex items-center hover:bg-accent/30">
                    <div className="w-64 shrink-0 truncate px-3 py-2 text-xs">
                      <Link href={`/projects/${p.id}`} className="font-mono text-[11px] text-muted-foreground hover:underline">
                        {p.code}
                      </Link>{' '}
                      <span className="text-foreground">{p.name}</span>
                      {p.client && <span className="block truncate text-[10px] text-muted-foreground">{p.client.name}</span>}
                    </div>
                    <div className="relative h-9 flex-1">
                      <div
                        className={`absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full ${STATUS_BAR[p.status] ?? 'bg-muted-foreground/40'}`}
                        style={{
                          left: `${pct(p.s as number)}%`,
                          width: `${Math.max(0.8, pct(p.e as number) - pct(p.s as number))}%`,
                        }}
                        title={`${p.code} · ${p.status} · ${p.plannedStart?.slice(0, 10)} → ${p.plannedEnd?.slice(0, 10)}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
