'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plane, Receipt } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
        <Link href="/travel/inbox">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <Plane className="h-4 w-4" /> Travel requests pending
              </CardDescription>
              <CardTitle className="text-3xl font-mono">{travel.data?.length ?? 0}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {travel.data?.[0] ? (
                <span>
                  Oldest: {travel.data[0].user.displayName} ·{' '}
                  <Badge variant="outline" className="text-[10px]">
                    {travel.data[0].fromCity.name} → {travel.data[0].toCity.name}
                  </Badge>
                </span>
              ) : (
                'Inbox zero.'
              )}
            </CardContent>
          </Card>
        </Link>
        <Link href="/expenses/inbox">
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Expenses pending
              </CardDescription>
              <CardTitle className="text-3xl font-mono">{expenses.data?.length ?? 0}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {expenses.data?.[0] ? (
                <span>
                  Total{' '}
                  {formatMoney(
                    expenses.data.reduce((s, e) => s + Number(e.amount), 0).toFixed(2),
                    expenses.data[0].currency,
                  )}{' '}
                  across {expenses.data.length} item(s)
                </span>
              ) : (
                'Inbox zero.'
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Generic configurable approval workflow (multi-step, threshold-routed) is Phase 2. For now
        each approvable item routes to its project PM (or Finance for expenses).
      </p>
    </AdminShell>
  );
}
