import { SimpleMasterAdmin } from '@/components/admin/simple-master';

export const dynamic = 'force-dynamic';

export default function DepartmentsPage() {
  return (
    <SimpleMasterAdmin
      resource="departments"
      title="Departments"
      description="Org structure — departments. Headcount is derived from employee records."
      noun="department"
    />
  );
}
