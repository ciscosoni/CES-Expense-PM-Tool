'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
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
        roles: ['ADMIN', 'PROJECT_MANAGER', 'FINANCE'],
      },
      {
        href: '/projects',
        label: 'Projects',
        icon: FolderKanban,
        roles: ['ADMIN', 'PROJECT_MANAGER', 'ENGINEER'],
      },
      {
        href: '/tasks',
        label: 'My Tasks',
        icon: ClipboardList,
        roles: ['ENGINEER', 'PROJECT_MANAGER', 'ADMIN'],
      },
      {
        href: '/travel',
        label: 'Travel',
        icon: Plane,
        roles: ['ENGINEER', 'PROJECT_MANAGER', 'ADMIN', 'FINANCE'],
      },
      {
        href: '/travel/inbox',
        label: 'Travel approvals',
        icon: ShieldCheck,
        roles: ['PROJECT_MANAGER', 'ADMIN'],
      },
      {
        href: '/expenses',
        label: 'Expenses',
        icon: Receipt,
        roles: ['ENGINEER', 'PROJECT_MANAGER', 'ADMIN', 'FINANCE'],
      },
      {
        href: '/expenses/inbox',
        label: 'Expense approvals',
        icon: ShieldCheck,
        roles: ['PROJECT_MANAGER', 'FINANCE', 'ADMIN'],
      },
      {
        href: '/approvals',
        label: 'Approvals (legacy)',
        icon: ShieldCheck,
        roles: ['APPROVER', 'PROJECT_MANAGER', 'FINANCE', 'ADMIN'],
        stub: true,
      },
    ],
  },
  {
    label: 'Finance',
    items: [
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
        stub: true,
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
    label: 'Admin — Master Data',
    items: [
      { href: '/admin/grades', label: 'Grades', icon: Settings2, roles: ['ADMIN'] },
      { href: '/admin/cost-rates', label: 'Cost Rates', icon: Settings2, roles: ['ADMIN'] },
      { href: '/admin/cities', label: 'Cities', icon: Globe2, roles: ['ADMIN'] },
      {
        href: '/admin/entitlement-matrix',
        label: 'Entitlement Matrix',
        icon: Settings2,
        roles: ['ADMIN'],
      },
      { href: '/admin/da-policies', label: 'DA Policies', icon: Settings2, roles: ['ADMIN'] },
      { href: '/admin/clients', label: 'Clients (SI/OEM)', icon: Building2, roles: ['ADMIN'] },
      { href: '/admin/end-customers', label: 'End Customers', icon: Building2, roles: ['ADMIN'] },
      { href: '/admin/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
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

  return (
    <aside className="hidden h-screen w-64 flex-col border-r bg-muted/30 md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
          CES
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">CES Tech</p>
          <p className="text-[11px] text-muted-foreground">Internal Operations</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sectionsVisible.map((s) => (
          <div key={s.label} className="mb-4">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                        'group flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </span>
                      {item.stub && (
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
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

      <div className="border-t p-3">
        <div className="mb-2">
          <p className="truncate text-sm font-medium">{user.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {user.roles.map((r) => (
              <Badge key={r} variant="secondary" className="text-[9px]">
                {r}
              </Badge>
            ))}
          </div>
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
