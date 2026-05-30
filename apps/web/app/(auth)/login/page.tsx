import { ArrowRight, Camera, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { loginAsDevUser } from '@/lib/actions/auth';
import { serverFetch } from '@/lib/server-api';
import type { AuthedUser } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: 'Evidence by default',
    body: 'GPS, geofences, photo EXIF and perceptual hashes — every action leaves an objective trace.',
  },
  {
    icon: MapPin,
    title: 'Visibility first',
    body: 'Live dashboards before forms. Everyone who matters sees the same data at the same moment.',
  },
  {
    icon: Camera,
    title: 'Computed, never re-entered',
    body: 'Payslips, DA, reimbursements and P&L are derived from evidence — and show their math on tap.',
  },
];

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default async function LoginPage() {
  let users: AuthedUser[] = [];
  let fetchError: string | null = null;
  try {
    users = await serverFetch<AuthedUser[]>('/users/dev-options');
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      {/* Brand / story panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border/60 p-12 lg:flex">
        {/* layered glows */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.4),transparent_70%)] blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 right-0 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,hsl(248_70%_60%/0.22),transparent_70%)] blur-2xl"
        />

        <div className="relative reveal flex items-center gap-3">
          <div className="brand-surface grid h-11 w-11 place-items-center rounded-xl text-sm font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_10px_30px_-8px_hsl(var(--glow)/0.8)]">
            CES
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">CES Tech</p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Internal Operations
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <Badge variant="info" dot className="reveal mb-5" style={{ ['--i' as string]: 1 }}>
            One source of truth
          </Badge>
          <h1
            className="reveal text-4xl font-semibold leading-[1.1] tracking-tight"
            style={{ ['--i' as string]: 2 }}
          >
            The operations platform that{' '}
            <span className="brand-text">ends the dispute.</span>
          </h1>
          <p
            className="reveal mt-4 text-sm leading-relaxed text-muted-foreground"
            style={{ ['--i' as string]: 3 }}
          >
            Projects, attendance, travel, expenses, reimbursements, daily allowance and live P&amp;L
            — for CES Tech field and leadership teams.
          </p>

          <ul className="mt-10 space-y-5">
            {PRINCIPLES.map((p, i) => (
              <li
                key={p.title}
                className="reveal flex gap-3.5"
                style={{ ['--i' as string]: 4 + i }}
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-card/50 text-primary backdrop-blur">
                  <p.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{p.title}</p>
                  <p className="text-[13px] leading-snug text-muted-foreground">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p
          className="relative reveal inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
          style={{ ['--i' as string]: 8 }}
        >
          <Sparkles className="h-3 w-3 text-[hsl(var(--ai-via))]" />
          Microsoft Entra ID sign-in replaces the dev picker in production.
        </p>
      </aside>

      {/* Sign-in panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="brand-surface mx-auto grid h-12 w-12 place-items-center rounded-xl text-sm font-bold text-white shadow-lg">
              CES
            </div>
          </div>

          <div className="reveal mb-6">
            <h2 className="text-xl font-semibold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a seeded user to explore the tool from that role.
            </p>
          </div>

          {fetchError && (
            <div className="reveal mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <p className="font-medium">
                Couldn&apos;t reach the API at{' '}
                {process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}.
              </p>
              <p className="mt-1">
                Start it: <code className="font-mono">pnpm --filter @ces/api dev</code>
              </p>
            </div>
          )}
          {users.length === 0 && !fetchError && (
            <p className="text-sm text-muted-foreground">
              No seeded users. Run{' '}
              <code className="font-mono">pnpm --filter @ces/api prisma:seed</code>.
            </p>
          )}

          <ul className="space-y-2">
            {users.map((u, i) => (
              <li key={u.id} className="reveal" style={{ ['--i' as string]: i + 1 }}>
                <form action={loginAsDevUser}>
                  <input type="hidden" name="email" value={u.email} />
                  <button
                    type="submit"
                    className="lift group flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 px-4 py-3 text-left backdrop-blur transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="brand-surface grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ring-1 ring-border/60">
                        {initials(u.displayName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{u.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                        {u.roles.map((r) => (
                          <Badge key={r} variant="secondary" className="text-[10px]">
                            {r.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <p className="mt-6 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="flex h-1.5 w-1.5 rounded-full bg-success" />
            Dev mode · {users.length} seeded {users.length === 1 ? 'user' : 'users'}
          </p>
        </div>
      </div>
    </div>
  );
}
