'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Search, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

interface PaletteItem {
  id: string;
  label: string;
  href: string;
  group: string;
  hint?: string;
}

const ITEMS: PaletteItem[] = [
  { id: 'dashboard', label: 'Live Ops dashboard', href: '/dashboard', group: 'Navigate' },
  { id: 'projects', label: 'Projects', href: '/projects', group: 'Navigate' },
  { id: 'tasks', label: 'My tasks', href: '/tasks', group: 'Navigate' },
  { id: 'travel', label: 'Travel', href: '/travel', group: 'Navigate' },
  { id: 'travel-inbox', label: 'Travel approvals inbox', href: '/travel/inbox', group: 'Navigate' },
  { id: 'expenses', label: 'My expenses', href: '/expenses', group: 'Navigate' },
  {
    id: 'expenses-inbox',
    label: 'Expense approvals inbox',
    href: '/expenses/inbox',
    group: 'Navigate',
  },
  { id: 'approvals', label: 'Approvals hub', href: '/approvals', group: 'Navigate' },
  {
    id: 'reimbursements',
    label: 'Reimbursement queue',
    href: '/finance/reimbursements',
    group: 'Finance',
  },
  { id: 'payslips', label: 'Payslip generator', href: '/finance/payslips', group: 'Finance' },
  { id: 'admin-grades', label: 'Grades', href: '/admin/grades', group: 'Admin' },
  { id: 'admin-cost-rates', label: 'Cost rates', href: '/admin/cost-rates', group: 'Admin' },
  { id: 'admin-cities', label: 'Cities', href: '/admin/cities', group: 'Admin' },
  {
    id: 'admin-entitlement',
    label: 'Entitlement matrix',
    href: '/admin/entitlement-matrix',
    group: 'Admin',
  },
  { id: 'admin-policies', label: 'DA policies', href: '/admin/da-policies', group: 'Admin' },
  { id: 'admin-clients', label: 'Clients', href: '/admin/clients', group: 'Admin' },
  {
    id: 'admin-end-customers',
    label: 'End customers',
    href: '/admin/end-customers',
    group: 'Admin',
  },
  { id: 'admin-users', label: 'Users', href: '/admin/users', group: 'Admin' },
];

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const router = useRouter();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter(
      (it) => it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const it of filtered) {
      const arr = map.get(it.group) ?? [];
      arr.push(it);
      map.set(it.group, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <>
      <PaletteTrigger onClick={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to anything — type a page name…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <kbd className="rounded border border-border/80 bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
              esc
            </kbd>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {grouped.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</p>
            )}
            {grouped.map(([group, items]) => (
              <div key={group} className="mb-2">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                <ul>
                  {items.map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          router.push(it.href);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm',
                          'text-foreground/90 hover:bg-accent hover:text-foreground',
                          'focus-visible:bg-accent focus-visible:outline-none',
                        )}
                      >
                        <span>{it.label}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="mt-2 border-t border-border/60 px-3 pb-2 pt-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-[hsl(var(--ai-via))]" />
                Ask-AI mode lands when the Anthropic key is wired (Slice 2C).
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PaletteTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-md border border-border/60 bg-secondary/50 px-2.5 text-xs text-muted-foreground',
        'transition-colors hover:bg-accent hover:text-foreground',
        'focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none',
      )}
      aria-label="Open command palette"
    >
      <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--ai-via))]" />
      <span>Ask AI · Jump…</span>
      <kbd className="ml-2 rounded border border-border/80 bg-background px-1 py-0.5 text-[10px]">
        ⌘K
      </kbd>
    </button>
  );
}
