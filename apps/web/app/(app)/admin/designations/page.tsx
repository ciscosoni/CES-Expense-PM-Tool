import { SimpleMasterAdmin } from '@/components/admin/simple-master';

export const dynamic = 'force-dynamic';

export default function DesignationsPage() {
  return (
    <SimpleMasterAdmin
      resource="designations"
      title="Designations"
      description="Org structure — job titles / designations. Headcount is derived from employee records."
      noun="designation"
    />
  );
}
