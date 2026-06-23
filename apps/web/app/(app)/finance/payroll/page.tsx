import { PayrollRegister } from '@/components/payroll-register';
import { serverFetch } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

interface Register {
  period: string;
  rows: Array<{
    userId: string;
    name: string;
    jobTitle: string | null;
    department: string | null;
    currency: string;
    hasStructure: boolean;
    gross: number;
    deductions: number;
    net: number;
  }>;
  totals: { headcount: number; grossTotal: number; deductionsTotal: number; netTotal: number };
  flags: { missingStructure: number; missingStructureNames: string[] };
}

export default async function PayrollPage() {
  const reg = await serverFetch<Register>('/payroll/register').catch(() => null);
  return <PayrollRegister initial={reg} />;
}
