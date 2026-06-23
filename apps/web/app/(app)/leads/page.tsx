import { LeadsBoard, type Board } from '@/components/leads-board';
import { serverFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const board = await serverFetch<Board>('/leads/board').catch(() => null);
  return <LeadsBoard initial={board} />;
}
