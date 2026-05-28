import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { serverFetch } from '@/lib/server-api';
import { formatDate, formatMoney } from '@/lib/format';
import type { ProjectDetail } from '@/lib/types';

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await serverFetch<ProjectDetail>(`/projects/${id}`);
  const signed = project.milestones.filter((m) => m.signedOffDate).length;
  const recognized = project.milestones
    .filter((m) => m.signedOffDate)
    .reduce((sum, m) => sum + Number(m.value), 0);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardDescription>Contract</CardDescription>
          <CardTitle className="text-2xl font-mono">
            {formatMoney(project.contractValue, project.contractCurrency)}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {project.billingModel}, signed
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Recognized revenue (signed milestones)</CardDescription>
          <CardTitle className="text-2xl font-mono">
            {formatMoney(recognized.toFixed(2), project.contractCurrency)}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {signed} / {project.milestones.length} milestones signed-off
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Plan</CardDescription>
          <CardTitle className="text-base">
            {formatDate(project.plannedStart, 'long')} → {formatDate(project.plannedEnd, 'long')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          PM <span className="font-medium text-foreground">{project.pm.displayName}</span>
        </CardContent>
      </Card>
    </div>
  );
}
