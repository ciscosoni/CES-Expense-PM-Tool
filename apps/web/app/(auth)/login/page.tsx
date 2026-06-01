import { ArrowRight, Camera, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { loginAsDevUser } from '@/lib/actions/auth';
import { isEntraConfigured } from '@/lib/msal';
import { MsalLoginButton } from '@/components/msal-login-button';

export const dynamic = 'force-dynamic';

/** Dev convenience login — single admin account. Real users sign in with Microsoft. */
const DEV_ADMIN_EMAIL = process.env.NEXT_PUBLIC_DEV_ADMIN_EMAIL || 'admin@cestech.in';

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

export default function LoginPage() {
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
            <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use your CES Tech Microsoft account.
            </p>
          </div>

          {/* Primary: Microsoft Entra sign-in */}
          <div className="reveal space-y-2">
            {isEntraConfigured() ? (
              <MsalLoginButton />
            ) : (
              <button
                type="button"
                disabled
                title="Microsoft Entra ID sign-in activates in production"
                className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-border/70 bg-card/40 px-4 py-2.5 text-sm font-medium text-muted-foreground"
              >
                <MicrosoftMark /> Continue with Microsoft
              </button>
            )}
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="flex h-1.5 w-1.5 rounded-full bg-success" />
              {isEntraConfigured()
                ? 'Secured by Microsoft Entra ID'
                : 'Microsoft Entra ID sign-in activates in production'}
            </p>
          </div>

          {/* Dev-only admin shortcut */}
          <div className="reveal mt-6 border-t border-border/50 pt-5" style={{ ['--i' as string]: 2 }}>
            <form action={loginAsDevUser}>
              <input type="hidden" name="email" value={DEV_ADMIN_EMAIL} />
              <button
                type="submit"
                className="lift group flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/50 px-4 py-3 text-left backdrop-blur transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-3">
                  <span className="brand-surface grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ring-1 ring-border/60">
                    AD
                  </span>
                  <div>
                    <p className="text-sm font-medium">Continue as Admin</p>
                    <p className="text-xs text-muted-foreground">Developer access · {DEV_ADMIN_EMAIL}</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            </form>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="flex h-1.5 w-1.5 rounded-full bg-success" />
              Dev mode shortcut — disabled once Microsoft sign-in is live.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MicrosoftMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
