import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { serverFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

interface EmployeeRow {
  id: string;
  displayName: string;
  email: string;
  jobTitle?: string | null;
  department?: string | null;
  roles?: string[];
  active?: boolean;
}

export default async function PeoplePage() {
  const people = await serverFetch<EmployeeRow[]>('/users').catch(() => [] as EmployeeRow[]);
  const active = people.filter((p) => p.active !== false).length;

  return (
    <AdminShell
      title="Employees"
      description={`Team directory — ${active} active of ${people.length}. Manage roles under Admin · Users & roles.`}
    >
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-40">Title</TableHead>
              <TableHead className="w-40">Department</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="w-24">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.length === 0 && <TableEmpty colSpan={6}>No employees yet.</TableEmpty>}
            {people.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-sm font-medium">
                  <Link href={`/people/${p.id}`} className="hover:text-primary hover:underline">
                    {p.displayName}
                  </Link>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.email}</TableCell>
                <TableCell className="text-xs">{p.jobTitle || '—'}</TableCell>
                <TableCell className="text-xs">{p.department || '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(p.roles ?? []).map((r) => (
                      <Badge key={r} variant="outline" className="text-[9px]">
                        {r.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {p.active === false ? (
                    <Badge variant="outline">Inactive</Badge>
                  ) : (
                    <Badge variant="success" dot>
                      Active
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AdminShell>
  );
}
