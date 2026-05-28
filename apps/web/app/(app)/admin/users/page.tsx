'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import type { AuthedUser, Grade } from '@/lib/types';

interface UserRow extends AuthedUser {
  department: string | null;
  active: boolean;
  managerId?: string | null;
}

export default function UsersPage() {
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserRow[]>('/users', { query: { includeInactive: 'true' } }),
  });
  const grades = useQuery({
    queryKey: ['grades'],
    queryFn: () => api.get<Grade[]>('/master-data/grades'),
  });
  const gradeById = React.useMemo(() => new Map(grades.data?.map((g) => [g.id, g])), [grades.data]);

  return (
    <AdminShell
      title="Users & Roles"
      description="In production these come from Microsoft Graph sync. Edit role + grade assignment here."
    >
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-32">Grade</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="w-20">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.isLoading && <TableEmpty colSpan={5}>Loading…</TableEmpty>}
            {users.data?.length === 0 && <TableEmpty colSpan={5}>No users.</TableEmpty>}
            {users.data?.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">{u.displayName}</div>
                  {u.jobTitle && <div className="text-xs text-muted-foreground">{u.jobTitle}</div>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  {u.gradeId ? (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {gradeById.get(u.gradeId)?.code ?? '?'}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} variant="secondary" className="text-[10px]">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {u.active ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Role + grade editing UI lands in the next sub-step, alongside Microsoft Graph sync.
      </p>
    </AdminShell>
  );
}
