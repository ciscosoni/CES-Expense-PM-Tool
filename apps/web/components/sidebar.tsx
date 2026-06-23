'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  FileBarChart,
  FolderKanban,
  Globe2,
  LayoutDashboard,
  LogOut,
  Plane,
  Receipt,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AuthedUser, UserRole } from '@/lib/types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { logout } from '@/lib/actions/auth';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  /** When `true`, route is a coming-soon stub. */
  stub?: boolean;
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Work',
    items: [
      {
        href: '/dashboard',
        label: 'Live Ops',
        icon: LayoutDashboard,
        roles: ['ADMIN', 'PROJECT_MANAGER', 'PROJECT_OWNER', 'FINANCE'],
      },
      {
        href: '/projects',
        label: 'Projects',
        icon: FolderKanban,
        roles: ['ADMIN', 'PROJECT_MANAGER', 'PROJECT_OWNER', 'ENGINEER'],
      },
      {
        href: '/projects/onboard',
        label: 'Onboard with AI',
        icon: Sparkles,
        roles: ['ADMIN', 'PROJECT_OWNER', 'PROJECT_MANAGER'],
      },
      {
        href: '/tasks',
        label: 'My tasks',
        icon: ClipboardList,
        roles: ['ENGINEER', 'PROJECT_MANAGER', 'ADMIN'],
      },
      {
        href: '/attendance',
        label: 'Attendance',
        icon: CalendarCheck,
        roles: ['ENGINEER', 'PROJECT_MANAGER', 'PROJECT_OWNER', 'ADMIN'],
      },
      {
        href: '/leave',
        label: 'Leave',
        icon: CalendarCheck,
        roles: ['ENGINEER', 'PROJECT_MANAGER', 'PROJECT_OWNER', 'FINANCE', 'ADMIN'],
      },
      {
        href: '/attendance/inbox',
        label: 'Regularization queue',
        icon: ShieldCheck,
        roles: ['PROJECT_MANAGER', 'PROJECT_OWNER', 'ADMIN'],
      },
      {
        href: '/travel',
        label: 'Travel',
        icon: Plane,
        roles: ['ENGINEER', 'PROJECT_MANAGER', 'PROJECT_OWNER', 'ADMIN', 'FINANCE'],
      },
      {
        href: '/travel/inbox',
        label: 'Travel approvals',
        icon: ShieldCheck,
        roles: ['PROJECT_MANAGER', 'PROJECT_OWNER', 'ADMIN'],
      },
      {
        href: '/expenses',
        label: 'Expenses',
        icon: Receipt,
        roles: ['ENGINEER', 'PROJECT_MANAGER', 'PROJECT_OWNER', 'ADMIN', 'FINANCE'],
      },
      {
        href: '/expenses/inbox',
        label: 'Expense approvals',
        icon: ShieldCheck,
        roles: ['PROJECT_OWNER', 'PROJECT_MANAGER', 'FINANCE', 'ADMIN'],
      },
      {
        href: '/approvals',
        label: 'Approvals hub',
        icon: ShieldCheck,
        roles: ['APPROVER', 'PROJECT_OWNER', 'PROJECT_MANAGER', 'FINANCE', 'ADMIN'],
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        href: '/finance/invoices',
        label: 'Invoices',
        icon: Wallet,
        roles: ['FINANCE', 'PROJECT_OWNER', 'ADMIN'],
      },
      {
        href: '/finance/reimbursements',
        label: 'Reimbursements',
        icon: Wallet,
        roles: ['FINANCE', 'ADMIN'],
      },
      {
        href: '/finance/payslips',
        label: 'Payslips',
        icon: CreditCard,
        roles: ['FINANCE', 'ADMIN'],
      },
      {
        href: '/finance/reports',
        label: 'Reports',
        icon: FileBarChart,
        roles: ['FINANCE', 'ADMIN'],
        stub: true,
      },
    ],
  },
  {
    label: 'Admin · Master Data',
    items: [
      { href: '/admin/grades', label: 'Grades', icon: Settings2, roles: ['ADMIN'] },
      { href: '/admin/cost-rates', label: 'Cost rates', icon: Settings2, roles: ['ADMIN'] },
      { href: '/admin/bill-rates', label: 'Bill rates', icon: Settings2, roles: ['ADMIN'] },
      { href: '/admin/cities', label: 'Cities', icon: Globe2, roles: ['ADMIN'] },
      {
        href: '/admin/entitlement-matrix',
        label: 'Entitlement matrix',
        icon: Settings2,
        roles: ['ADMIN'],
      },
      { href: '/admin/da-policies', label: 'DA policies', icon: Settings2, roles: ['ADMIN'] },
      { href: '/admin/clients', label: 'Clients (SI/OEM)', icon: Building2, roles: ['ADMIN'] },
      { href: '/admin/end-customers', label: 'End customers', icon: Building2, roles: ['ADMIN'] },
      { href: '/admin/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
      {
        href: '/admin/anomaly-rules',
        label: 'Anomaly rules',
        icon: AlertTriangle,
        roles: ['ADMIN'],
      },
      {
        href: '/admin/budget-worklist',
        label: 'Budget worklist',
        icon: AlertTriangle,
        roles: ['ADMIN', 'FINANCE', 'PROJECT_OWNER'],
      },
      {
        href: '/admin/auto-approval',
        label: 'Auto-approval',
        icon: Settings2,
        roles: ['ADMIN'],
      },
    ],
  },
];

export function Sidebar({ user }: { user: AuthedUser }) {
  const pathname = usePathname();
  const userRoles = new Set(user.roles);
  const sectionsVisible = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((it) => it.roles.some((r) => userRoles.has(r))),
  })).filter((s) => s.items.length > 0);

  const initials = user.displayName
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside className="relative hidden h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-card/70 backdrop-blur-xl md:flex">
      <div className="flex h-14 items-center gap-2.5 border-b border-border/60 px-4">
        <div
          className="brand-surface relative grid h-8 w-8 place-items-center rounded-lg text-[11px] font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_4px_16px_-3px_hsl(var(--glow)/0.8)]"
          aria-hidden
        >
          CES
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">CES Tech</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Internal Operations
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {sectionsVisible.map((s) => (
          <div key={s.label} className="mb-4">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
              {s.label}
            </p>
            <ul className="space-y-0.5">
              {s.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'group relative flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200',
                        active
                          ? 'bg-[linear-gradient(90deg,hsl(var(--primary)/0.2),hsl(var(--primary)/0.04))] text-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.04)]'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                      )}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_12px_hsl(var(--glow)/0.9)]"
                          aria-hidden
                        />
                      )}
                      <span className="flex items-center gap-2.5">
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-colors',
                            active
                              ? 'text-primary'
                              : 'text-muted-foreground/70 group-hover:text-foreground',
                          )}
                        />
                        {item.label}
                      </span>
                      {item.stub && (
                        <span className="rounded bg-muted/60 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                          soon
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border/60 p-3">
        <div className="mb-2.5 flex items-center gap-2.5 rounded-lg p-1.5">
          <div
            className="brand-surface grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ring-1 ring-border/60"
            aria-hidden
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight">{user.displayName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="mb-2.5 flex flex-wrap gap-1 px-1.5">
          {user.roles.map((r) => (
            <Badge key={r} variant="info" className="text-[9px]">
              {r.replace('_', ' ')}
            </Badge>
          ))}
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
