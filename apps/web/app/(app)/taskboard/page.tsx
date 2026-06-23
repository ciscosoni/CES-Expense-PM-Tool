import { Taskboard } from '@/components/taskboard';
import { serverFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

interface ProjectRow {
  id: string;
  code: string;
  name: string;
}

export default async function TaskboardPage() {
  const projects = await serverFetch<ProjectRow[]>('/projects').catch(() => [] as ProjectRow[]);
  return (
    <Taskboard projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))} />
  );
}
