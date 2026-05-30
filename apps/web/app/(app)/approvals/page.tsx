'use client';

import { useQuery } from '@tanstack/react-query';
import { Plane, Receipt } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { StatCard } from '@/components/stat-card';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Expense, TravelRequest } from '@/lib/types';

export default function ApprovalsHubPage() {
  const travel = useQuery({
    queryKey: ['travel-requests', 'inbox'],
    queryFn: () => api.get<TravelRequest[]>('/travel-requests/inbox'),
  });
  const expenses = useQuery({
    queryKey: ['expenses', 'inbox'],
    queryFn: () => api.get<Expense[]>('/expenses/inbox'),
  });

  return (
    <AdminShell
      title="Approvals Hub"
      description="Everything that needs your decision, in one place. Drill into Travel or Expenses to act."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <StatCard
          index={0}
          href="/travel/inbox"
          label="Travel requests pending"
          value={travel.data?.length ?? 0}
          tone={travel.data?.length ? 'primary' : 'muted'}
          icon={<Plane className="h-4 w-4" />}
          hint={
            travel.data?.[0]
              ? `Oldest: ${travel.data[0].user.displayName} · ${travel.data[0].fromCity.name} → ${travel.data[0].toCity.name}`
              : 'Inbox zero.'
          }
        />
        <StatCard
          index={1}
          href="/expenses/inbox"
          label="Expenses pending"
          value={expenses.data?.length ?? 0}
          tone={expenses.data?.length ? 'primary' : 'muted'}
          icon={<Receipt className="h-4 w-4" />}
          hint={
            expenses.data?.[0]
              ? `Total ${formatMoney(
                  expenses.data.reduce((s, e) => s + Number(e.amount), 0).toFixed(2),
                  expenses.data[0].currency,
                )} across ${expenses.data.length} item(s)`
              : 'Inbox zero.'
          }
        />
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Generic configurable approval workflow (multi-step, threshold-routed) is Phase 2. For now
        each approvable item routes to its project PM (or Finance for expenses).
      </p>
    </AdminShell>
  );
}
