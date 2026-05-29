import { PageHeader } from '@/components/page-header';
import { Tabs } from '@/components/tabs';
import { serverFetch } from '@/lib/server-api';
import { formatDate, formatMoney, projectStatusColor } from '@/lib/format';
import type { ProjectDetail } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await serverFetch<ProjectDetail>(`/projects/${id}`);
  const statusColor = projectStatusColor(project.status);
  const colorClass = {
    green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    red: 'bg-red-100 text-red-700 border-red-200',
    gray: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  }[statusColor];

  return (
    <div className="container py-8">
      <PageHeader
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{project.code}</span>
            <Badge className={`border ${colorClass}`}>{project.status}</Badge>
            <span>{project.billingModel}</span>
            <span>•</span>
            <span>{project.client.name}</span>
            {project.endCustomer && (
              <>
                <span>→</span>
                <span>{project.endCustomer.name}</span>
              </>
            )}
            {project.whiteLabel && (
              <Badge variant="outline" className="text-[10px]">
                WHITE-LABEL
              </Badge>
            )}
            <span>•</span>
            <span>PM {project.pm.displayName}</span>
          </span>
        }
        actions={
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Contract value</p>
            <p className="font-mono text-base font-semibold">
              {formatMoney(project.contractValue, project.contractCurrency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(project.plannedStart)} → {formatDate(project.plannedEnd)}
            </p>
          </div>
        }
      />
      <Tabs
        items={[
          { href: `/projects/${id}`, label: 'Overview' },
          { href: `/projects/${id}/tasks`, label: 'Tasks' },
          { href: `/projects/${id}/team`, label: 'Team' },
          { href: `/projects/${id}/pnl`, label: 'P&L' },
          { href: `/projects/${id}/milestones`, label: 'Milestones' },
          { href: `/projects/${id}/change-requests`, label: 'Change requests' },
          { href: `/projects/${id}/discussion`, label: 'Discussion' },
        ]}
      />
      <div className="pt-6">{children}</div>
    </div>
  );
}
