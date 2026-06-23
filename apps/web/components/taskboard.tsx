'use client';

import * as React from 'react';
import Link from 'next/link';
import { CircleDot } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Status = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
const COLUMNS: Status[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];
const LABEL: Record<Status, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};
const DOT: Record<Status, string> = {
  TODO: 'text-muted-foreground',
  IN_PROGRESS: 'text-primary',
  BLOCKED: 'text-red-500',
  DONE: 'text-emerald-500',
  CANCELLED: 'text-muted-foreground/50',
};

interface Task {
  id: string;
  name: string;
  status: Status;
  percentComplete: number;
  plannedEnd: string | null;
  assignee: { id: string; displayName: string } | null;
  project: { id: string; code: string; name: string } | null;
}
interface Project {
  id: string;
  code: string;
  name: string;
}

export function Taskboard({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = React.useState<string>('ALL');
  const [tasks, setTasks] = React.useState<Task[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async (pid: string) => {
    setTasks(null);
    const qs = pid && pid !== 'ALL' ? `?projectId=${pid}` : '';
    const r = await fetch(`/api/tasks${qs}`, { cache: 'no-store' });
    if (r.ok) setTasks((await r.json()) as Task[]);
    else setTasks([]);
  }, []);

  React.useEffect(() => {
    void load(projectId);
  }, [projectId, load]);

  async function move(id: string, status: Status) {
    setBusy(id);
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load(projectId);
    setBusy(null);
  }

  const counts = COLUMNS.map((s) => (tasks ?? []).filter((t) => t.status === s).length);
  const total = tasks?.length ?? 0;

  return (
    <AdminShell
      title="Taskboard"
      description={tasks ? `${total} tasks${projectId !== 'ALL' ? ' in this project' : ' across projects'}` : 'Kanban across projects'}
      actions={
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-56 text-xs">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                <span className="font-mono">{p.code}</span> · {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {!tasks ? (
        <p className="text-sm text-muted-foreground">Loading board…</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((status, ci) => {
            const items = tasks.filter((t) => t.status === status).slice(0, 100);
            return (
              <div key={status} className="flex w-72 shrink-0 flex-col">
                <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <CircleDot className={`h-3 w-3 ${DOT[status]}`} />
                  {LABEL[status]}
                  <span className="rounded bg-secondary px-1.5 font-mono text-foreground">{counts[ci]}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-[11px] text-muted-foreground">
                      Empty
                    </div>
                  )}
                  {items.map((t, i) => (
                    <Card key={t.id} interactive className="reveal p-3" style={{ ['--i' as string]: Math.min(i, 8) }}>
                      <p className="text-sm font-medium leading-tight">{t.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        {t.project && (
                          <Link href={`/projects/${t.project.id}`} className="font-mono hover:underline">
                            {t.project.code}
                          </Link>
                        )}
                        {t.assignee && <span>· {t.assignee.displayName}</span>}
                        {t.percentComplete > 0 && <span>· {t.percentComplete}%</span>}
                      </div>
                      {t.percentComplete > 0 && (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${t.percentComplete}%` }} />
                        </div>
                      )}
                      <div className="mt-2.5">
                        <Select value={t.status} onValueChange={(v) => move(t.id, v as Status)}>
                          <SelectTrigger className="h-7 text-[11px]" disabled={busy === t.id}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COLUMNS.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                {LABEL[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </Card>
                  ))}
                  {tasks.filter((t) => t.status === status).length > 100 && (
                    <p className="px-1 text-[10px] text-muted-foreground">+{tasks.filter((t) => t.status === status).length - 100} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
