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

interface HolidayRow {
  id: string;
  name: string;
  date: string;
}

function fmt(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function HolidaysPage() {
  const holidays = await serverFetch<HolidayRow[]>('/holidays').catch(() => [] as HolidayRow[]);
  const today = new Date();
  const upcoming = holidays.filter((h) => new Date(h.date) >= new Date(today.toDateString())).length;

  return (
    <AdminShell
      title="Holidays"
      description={`Company holiday calendar — ${upcoming} upcoming of ${holidays.length}.`}
    >
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Holiday</TableHead>
              <TableHead className="w-64">Date</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays.length === 0 && <TableEmpty colSpan={3}>No holidays configured.</TableEmpty>}
            {holidays.map((h) => {
              const isUpcoming = new Date(h.date) >= new Date(today.toDateString());
              return (
                <TableRow key={h.id}>
                  <TableCell className="text-sm font-medium">{h.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmt(h.date)}</TableCell>
                  <TableCell>
                    {isUpcoming ? (
                      <Badge variant="info" dot>
                        Upcoming
                      </Badge>
                    ) : (
                      <Badge variant="outline">Past</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </AdminShell>
  );
}
