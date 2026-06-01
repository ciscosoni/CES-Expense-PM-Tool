import * as React from 'react';
import {
  CalendarCheck,
  Download,
  FileCode,
  IndianRupee,
  Plane,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const REPORTS: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}[] = [
  {
    title: 'Portfolio P&L',
    description:
      'Revenue, cost, gross profit and margin per project — the same numbers the leadership dashboard shows, derived live.',
    href: '/api/reports/portfolio-pnl.xlsx',
    icon: <TrendingUp className="h-5 w-5" />,
  },
  {
    title: 'Resource utilization',
    description:
      'Current-month allocation per engineer, with overbooking flags. Useful for staffing and capacity planning.',
    href: '/api/reports/utilization.xlsx',
    icon: <Users className="h-5 w-5" />,
  },
  {
    title: 'Reimbursement register',
    description:
      'Every reimbursement batch with employee, amount, status and payout date — for finance reconciliation.',
    href: '/api/reports/reimbursements.xlsx',
    icon: <IndianRupee className="h-5 w-5" />,
  },
  {
    title: 'Attendance summary',
    description:
      'Current-month attendance per engineer — active days, on-site days and hours, derived from geofenced events.',
    href: '/api/reports/attendance.xlsx',
    icon: <CalendarCheck className="h-5 w-5" />,
  },
  {
    title: 'Travel spend',
    description:
      'Per-trip cost breakdown — travel, lodging, DA and local conveyance — with totals for travel-budget review.',
    href: '/api/reports/travel-spend.xlsx',
    icon: <Plane className="h-5 w-5" />,
  },
  {
    title: 'Payslip register',
    description:
      "This month's payslips per employee — effort cost, DA, reimbursements and grand total, each derived line-by-line.",
    href: '/api/reports/payslips.xlsx',
    icon: <Receipt className="h-5 w-5" />,
  },
  {
    title: 'Reimbursements → Tally',
    description:
      'Tally-importable XML payment vouchers for every reimbursement. Ledger names are configurable to match your chart of accounts.',
    href: '/api/reports/reimbursements-tally.xml',
    icon: <FileCode className="h-5 w-5" />,
  },
];

export default function ReportsPage() {
  return (
    <AdminShell
      title="Reports"
      description="Every view exports to .xlsx — open in Excel, Google Sheets, or feed into BI."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.href} className="flex flex-col">
            <CardHeader>
              <div className="mb-2 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                {r.icon}
              </div>
              <CardTitle className="text-base">{r.title}</CardTitle>
              <CardDescription>{r.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button asChild variant="outline" className="w-full">
                <a href={r.href} download>
                  <Download className="h-4 w-4" /> Download {r.href.endsWith('.xml') ? '.xml' : '.xlsx'}
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Exports are generated on demand from live data and respect your role. A Tally-format
        reimbursement export for accounting is on the way.
      </p>
    </AdminShell>
  );
}
