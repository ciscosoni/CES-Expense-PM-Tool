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

interface ClientRow {
  id: string;
  name: string;
  kind: 'SI' | 'OEM';
  active?: boolean;
}

export default async function ClientsPage() {
  const clients = await serverFetch<ClientRow[]>(
    '/master-data/clients?includeInactive=true',
  ).catch(() => [] as ClientRow[]);

  return (
    <AdminShell
      title="Clients"
      description="System Integrators and OEMs you deliver for. Edit the master record under Admin · Clients master."
    >
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Type</TableHead>
              <TableHead className="w-28">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.length === 0 && <TableEmpty colSpan={3}>No clients yet.</TableEmpty>}
            {clients.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-sm font-medium">{c.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{c.kind}</Badge>
                </TableCell>
                <TableCell>
                  {c.active === false ? (
                    <Badge variant="outline">Inactive</Badge>
                  ) : (
                    <Badge variant="info" dot>
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
