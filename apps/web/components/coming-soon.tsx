import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from './page-header';

export function ComingSoon({
  title,
  phase,
  summary,
}: {
  title: string;
  phase: string;
  summary: string;
}) {
  return (
    <div className="container py-8">
      <PageHeader title={title} description={`Lands in ${phase}.`} />
      <Card>
        <CardHeader>
          <CardTitle>{phase}</CardTitle>
          <CardDescription>{summary}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The master-data admin tools are already live — pick anything under <strong>Admin</strong>{' '}
          in the sidebar if you have ADMIN role. This page becomes functional in the phase noted
          above.
        </CardContent>
      </Card>
    </div>
  );
}
