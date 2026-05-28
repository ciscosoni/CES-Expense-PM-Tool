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
import { serverFetch } from '@/lib/server-api';
import { formatDate, formatMoney } from '@/lib/format';
import type { Milestone, ProjectDetail } from '@/lib/types';

export default async function ProjectMilestonesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await serverFetch<ProjectDetail>(`/projects/${id}`);
  const milestones: Milestone[] = project.milestones;

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="text-right w-40">Value</TableHead>
            <TableHead className="w-40">Planned</TableHead>
            <TableHead className="w-40">Signed off</TableHead>
            <TableHead className="w-32">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {milestones.length === 0 && <TableEmpty colSpan={5}>No milestones yet.</TableEmpty>}
          {milestones.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{m.name}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {formatMoney(m.value, m.currency)}
              </TableCell>
              <TableCell className="font-mono text-xs">{formatDate(m.plannedDate)}</TableCell>
              <TableCell className="font-mono text-xs">{formatDate(m.signedOffDate)}</TableCell>
              <TableCell>
                {m.signedOffDate ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">
                    Recognized
                  </Badge>
                ) : (
                  <Badge variant="outline">Pending</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
