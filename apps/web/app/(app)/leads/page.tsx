import { Target } from 'lucide-react';
import { ModulePlaceholder } from '@/components/module-placeholder';

export const dynamic = 'force-dynamic';

export default function LeadsPage() {
  return (
    <ModulePlaceholder
      title="Leads"
      description="Sales pipeline — deals, lead contacts, and conversion to clients/projects."
      icon={Target}
      points={[
        'Kanban deal board with pipeline stages (Generated → Qualified → Proposal Sent → Win / Lost)',
        'Lead contacts: company, owner, category, value, contact details',
        'Multiple named pipelines, lead sources & categories',
        'Convert a won deal into a client + project (feeds onboarding)',
      ]}
    />
  );
}
