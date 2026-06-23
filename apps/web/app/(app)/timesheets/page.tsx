import { Clock } from 'lucide-react';
import { ModulePlaceholder } from '@/components/module-placeholder';

export const dynamic = 'force-dynamic';

export default function TimesheetsPage() {
  return (
    <ModulePlaceholder
      title="Timesheets"
      description="Aggregated time logs across projects — hours, earnings, approval, invoicing."
      icon={Clock}
      points={[
        'All time logs in one grid: employee, project, task, date, hours',
        'Hourly rate → earnings, with approval (pending / approved)',
        'Breaks + live start/stop timer (the TimeLog + ActiveTimer models already exist)',
        'Filter by project / employee / approved / invoiced — today logs live per task under Tasks',
      ]}
    />
  );
}
