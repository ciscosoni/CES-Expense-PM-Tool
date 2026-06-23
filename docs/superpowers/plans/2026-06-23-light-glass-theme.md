# Light Glass Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a premium light "glass" theme the default for the web app while keeping the existing dark theme behind a toggle, with token-driven glass/gloss surfaces and motion that propagate app-wide.

**Architecture:** The app is already token-driven (`globals.css` defines `:root` light + `.dark`, dark forced via `className="dark"` on `<html>`). We (1) default to light via `next-themes`, (2) tokenize the glass/gloss/shadow recipes so the existing `.glass`/`.lift`/button utilities render light or dark from the same classes, (3) add a light aurora+grid background, (4) add `framer-motion` for flagship count-up + route fade, (5) sweep the ~8 bespoke `text-white`/`dark:` files. Most of the 73 `.tsx` files inherit the new look with no edit.

**Tech Stack:** Next.js 15 (App Router), React 19 RC, Tailwind + `tailwindcss-animate`, `next-themes` (new), `framer-motion` (new), IBM Plex Sans/Mono via `next/font`, `lucide-react`.

## Global Constraints

- **Scope is `apps/web` only.** Do not touch `apps/mobile` or any API/Prisma code.
- **Dark theme is preserved, never deleted.** The `.dark` block and `.dark body::before/::after` in `globals.css` stay; we only add light equivalents and move shadow recipes into tokens that `.dark` also sets.
- **Light is the default; users opt into dark.** `next-themes`: `attribute="class"`, `defaultTheme="light"`, `enableSystem={false}`, `disableTransitionOnChange`.
- **Keep IBM Plex Sans/Mono.** No font swap.
- **AI accents are blue→cyan, never purple/pink** (light `:root` AI tokens retuned).
- **Motion budget:** transform/opacity only; 150–300ms micro, ≤400ms complex; honor `prefers-reduced-motion` (collapse to instant). The existing `@media (prefers-reduced-motion)` block at the bottom of `globals.css` must remain.
- **Contrast:** every text/surface pair ≥ 4.5:1 (normal text); glass surfaces sit at ≥ 0.72 opacity and `--muted-foreground` is darkened for this reason.
- **Verification is presentation-layer:** there is no web unit-test harness, so each task is verified by `pnpm --filter @ces/web typecheck`, `pnpm --filter @ces/web build`, and a **dual-theme visual walk** (light default + toggle to dark) — not unit tests. Run the dev server with `pnpm --filter @ces/web dev` (port 3000) for visual checks; sign in locally via the dev-user picker.
- **Commit after each task.** Branch is `feat/light-glass-theme` (already created).

---

### Task 1: Default to light + theme provider + toggle

Wire `next-themes`, stop forcing dark, default to light, add a topbar toggle.

**Files:**
- Modify: `apps/web/package.json` (add deps)
- Modify: `apps/web/components/providers.tsx` (wrap with `ThemeProvider`)
- Modify: `apps/web/app/layout.tsx:30` (remove `dark` from `<html>` className)
- Create: `apps/web/components/theme-toggle.tsx`
- Modify: `apps/web/app/(app)/layout.tsx` (mount toggle in header)

**Interfaces:**
- Produces: `ThemeToggle` (default-styled icon button) consumed by the app header. `next-themes` `useTheme()` available app-wide.

- [ ] **Step 1: Add dependencies**

Run from repo root:
```bash
pnpm --filter @ces/web add next-themes@^0.4.4 framer-motion@^11.11.0
```
Expected: both added to `apps/web/package.json` dependencies; lockfile updated.

- [ ] **Step 2: Wrap Providers with ThemeProvider**

In `apps/web/components/providers.tsx`, add the import at the top with the other imports:
```tsx
import { ThemeProvider } from 'next-themes';
```
Then change the `tree` constant so the `ThemeProvider` wraps everything:
```tsx
  const tree = (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={client}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
```
(The `isEntraConfigured() ? <EntraProvider>{tree}</EntraProvider> : tree` return stays unchanged.)

- [ ] **Step 3: Stop forcing dark in the root layout**

In `apps/web/app/layout.tsx`, change line 30 from:
```tsx
      className={`dark ${plexSans.variable} ${plexMono.variable}`}
```
to:
```tsx
      className={`${plexSans.variable} ${plexMono.variable}`}
```
Leave `suppressHydrationWarning` in place (next-themes needs it to avoid hydration warnings).

- [ ] **Step 4: Create the theme toggle**

Create `apps/web/components/theme-toggle.tsx`:
```tsx
'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={mounted ? `Switch to ${isDark ? 'light' : 'dark'} theme` : 'Toggle theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {/* Avoid hydration mismatch: render a stable icon until mounted. */}
      {mounted && isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
```

- [ ] **Step 5: Mount the toggle in the app header**

In `apps/web/app/(app)/layout.tsx`, add the import near the top:
```tsx
import { ThemeToggle } from '@/components/theme-toggle';
```
Then in the header's right-hand control cluster, add `<ThemeToggle />` before `<NotificationBell />`:
```tsx
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <NotificationBell />
            <CommandPalette />
          </div>
```

- [ ] **Step 6: Typecheck + build**

Run:
```bash
pnpm --filter @ces/web typecheck && pnpm --filter @ces/web build
```
Expected: PASS (no type errors; build completes).

- [ ] **Step 7: Visual check**

Run `pnpm --filter @ces/web dev`, open the app, sign in via the dev picker.
Expected: app renders on a **white/light** background by default; the topbar shows a moon icon; clicking it switches to the existing dark theme (sun icon) and back; hard refresh in each mode shows **no flash** of the wrong theme.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/components/providers.tsx apps/web/app/layout.tsx apps/web/components/theme-toggle.tsx 'apps/web/app/(app)/layout.tsx'
git commit -m "feat(web): default to light theme + next-themes provider + topbar toggle"
```

---

### Task 2: Tokenize glass/gloss/shadow recipes + retune light palette

Move the dark-hardcoded shadow recipes into theme tokens so `.glass`/`.lift` render correctly in light, and refine the light `:root` palette.

**Files:**
- Modify: `apps/web/app/globals.css` (`:root` block lines 7–36, `.dark` block lines 40–70, `.glass` lines 167–176, `.lift` lines 179–194)

**Interfaces:**
- Produces: CSS custom properties `--glass-bg`, `--glass-border`, `--gloss-highlight`, `--shadow-card`, `--shadow-card-hover`, `--shadow-btn` defined in both `:root` and `.dark`; consumed by `.glass`, `.lift` (this task) and `Button` (Task 4).

- [ ] **Step 1: Refine the light `:root` tokens**

In `apps/web/app/globals.css`, replace the `:root` foreground/muted lines and add new tokens. Change line 9:
```css
    --foreground: 240 10% 9%;
```
to:
```css
    --foreground: 222 47% 11%;
```
Change line 20:
```css
    --muted-foreground: 240 4% 46%;
```
to:
```css
    --muted-foreground: 240 5% 38%;
```
Replace the light AI tokens (lines 32–34):
```css
    --ai-from: 250 84% 67%;
    --ai-via: 222 90% 62%;
    --ai-to: 192 92% 58%;
```
with the blue→cyan retune:
```css
    --ai-from: 222 90% 62%;
    --ai-via: 210 90% 60%;
    --ai-to: 192 92% 58%;
```
Then, immediately after the `--glow: 219 90% 54%;` line (line 35) and before the closing `}` of `:root`, add the recipe tokens:
```css

    /* Authority ink for headings/sidebar. */
    --ink-strong: 222 47% 18%;

    /* Glass + gloss recipe tokens — consumed by .glass / .lift / buttons.
       Light: soft, near-white frosted surface on the aurora ground. */
    --glass-bg: linear-gradient(180deg, hsl(0 0% 100% / 0.80), hsl(0 0% 100% / 0.62));
    --glass-border: 240 6% 88%;
    --gloss-highlight: inset 0 1px 0 0 hsl(0 0% 100% / 0.75);
    --shadow-card:
      inset 0 1px 0 0 hsl(0 0% 100% / 0.70),
      0 1px 2px 0 hsl(222 47% 11% / 0.05),
      0 16px 40px -24px hsl(222 47% 11% / 0.16);
    --shadow-card-hover:
      inset 0 1px 0 0 hsl(0 0% 100% / 0.85),
      0 1px 2px 0 hsl(222 47% 11% / 0.06),
      0 18px 40px -20px hsl(var(--glow) / 0.26),
      0 0 0 1px hsl(var(--primary) / 0.12);
    --shadow-btn:
      0 1px 2px 0 hsl(222 47% 11% / 0.10),
      inset 0 1px 0 0 hsl(0 0% 100% / 0.25);
```

- [ ] **Step 2: Add matching tokens to `.dark` (preserve current look)**

In the `.dark` block, immediately after `--glow: 217 92% 58%;` (line 69) and before the closing `}`, add the dark recipes (these reproduce the existing hardcoded `.glass`/`.lift` shadows so dark is visually unchanged):
```css

    --ink-strong: 220 20% 97%;
    --glass-bg: linear-gradient(180deg, hsl(var(--card) / 0.72), hsl(var(--card) / 0.55));
    --glass-border: 240 10% 18%;
    --gloss-highlight: inset 0 1px 0 0 hsl(0 0% 100% / 0.05);
    --shadow-card:
      inset 0 1px 0 0 hsl(0 0% 100% / 0.05),
      0 1px 2px 0 rgb(0 0 0 / 0.3),
      0 16px 40px -24px rgb(0 0 0 / 0.7);
    --shadow-card-hover:
      inset 0 1px 0 0 hsl(0 0% 100% / 0.07),
      0 1px 2px 0 rgb(0 0 0 / 0.3),
      0 18px 40px -20px hsl(var(--glow) / 0.55),
      0 0 0 1px hsl(var(--primary) / 0.18);
    --shadow-btn:
      0 1px 2px rgb(0 0 0 / 0.3),
      inset 0 1px 0 hsl(0 0% 100% / 0.15);
```

- [ ] **Step 3: Rework `.glass` to consume the tokens**

Replace the `.glass` rule (lines 167–176) with:
```css
  .glass {
    background: var(--glass-bg);
    backdrop-filter: blur(12px) saturate(140%);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
    border: 1px solid hsl(var(--glass-border));
    box-shadow: var(--shadow-card);
  }
  /* Solid fallback where backdrop-filter is unsupported. */
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .glass {
      background: hsl(var(--card));
    }
  }
```

- [ ] **Step 4: Rework `.lift:hover` to consume the hover token**

Replace the `.lift:hover` rule (lines 186–194) with:
```css
  .lift:hover {
    transform: translateY(-3px);
    border-color: hsl(var(--primary) / 0.5);
    box-shadow: var(--shadow-card-hover);
  }
```
(Leave the `.lift` base transition rule, lines 179–185, unchanged.)

- [ ] **Step 5: Typecheck + build**

Run:
```bash
pnpm --filter @ces/web typecheck && pnpm --filter @ces/web build
```
Expected: PASS.

- [ ] **Step 6: Visual check (both themes)**

In the dev server: in **light**, cards (e.g. dashboard KPI cards) read as soft frosted white with a hairline border and a gentle shadow — not flat, not heavy black shadows; hovering an interactive card lifts it with a soft blue glow. Toggle to **dark**: cards look exactly as before this task.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(web): theme-aware glass/gloss/shadow tokens + refined light palette"
```

---

### Task 3: Light background graphics (aurora + grid)

Give the light theme depth so glass surfaces read; dark background untouched.

**Files:**
- Modify: `apps/web/app/globals.css` (add light `body::before/::after` after the existing `.dark body::after` block, ~line 137; generalize scrollbar rules)

**Interfaces:**
- Produces: a fixed light aurora + masked grid painted behind all content when the `.dark` class is absent.

- [ ] **Step 1: Add the light aurora + grid**

In `apps/web/app/globals.css`, immediately after the closing `}` of the `.dark body::after` rule (line 137) and before the `:focus-visible` rule, add:
```css
  /* Light theme atmosphere — soft aurora + faint masked grid so frosted
     glass has something to read against on a white page. Static (kept under
     reduced-motion). Mirrors the dark mesh, retuned lighter. */
  html:not(.dark) body::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -2;
    pointer-events: none;
    background:
      radial-gradient(54rem 54rem at 12% -8%, hsl(var(--primary) / 0.07), transparent 60%),
      radial-gradient(48rem 48rem at 92% 4%, hsl(192 92% 58% / 0.06), transparent 58%),
      radial-gradient(64rem 48rem at 60% 110%, hsl(248 70% 60% / 0.04), transparent 60%);
  }

  html:not(.dark) body::after {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -2;
    pointer-events: none;
    background-image:
      linear-gradient(hsl(var(--border) / 0.6) 1px, transparent 1px),
      linear-gradient(90deg, hsl(var(--border) / 0.6) 1px, transparent 1px);
    background-size: 48px 48px;
    -webkit-mask-image: radial-gradient(60rem 50rem at 50% -10%, #000 25%, transparent 72%);
    mask-image: radial-gradient(60rem 50rem at 50% -10%, #000 25%, transparent 72%);
    opacity: 0.6;
  }
```

- [ ] **Step 2: Generalize scrollbar styling to both themes**

The scrollbar rules at lines 145–161 are `.dark`-scoped. Make them apply in both themes by removing the `.dark ` prefix from each of the four selectors:
```css
  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: hsl(var(--muted));
    border-radius: 8px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--accent));
    background-clip: padding-box;
  }
```

- [ ] **Step 3: Build**

Run:
```bash
pnpm --filter @ces/web build
```
Expected: PASS.

- [ ] **Step 4: Visual check**

Light theme: the page is no longer flat white — a faint blue/cyan glow sits in the corners and a subtle grid fades in near the top, behind content; glass cards now clearly separate from the ground. Dark theme: unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(web): light aurora + grid background; themed scrollbars"
```

---

### Task 4: Restyle primitives that hardcode dark shadows

Point the button shadows at the new tokens; tidy the outline fill for light.

**Files:**
- Modify: `apps/web/components/ui/button.tsx` (the `default` and `outline` variant strings)

**Interfaces:**
- Consumes: `--shadow-btn`, `--glow` from Task 2.

- [ ] **Step 1: Update the `default` and `outline` button variants**

In `apps/web/components/ui/button.tsx`, in `buttonVariants`, change the `default` variant from:
```tsx
        default:
          'bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/0.3),inset_0_1px_0_hsl(0_0%_100%/0.15)] hover:bg-primary/90 hover:shadow-[0_4px_16px_-4px_hsl(var(--glow)/0.5)]',
```
to:
```tsx
        default:
          'bg-primary text-primary-foreground shadow-[var(--shadow-btn)] hover:bg-primary/90 hover:shadow-[0_6px_18px_-6px_hsl(var(--glow)/0.5)]',
```
and change the `outline` variant from:
```tsx
        outline:
          'border border-border/80 bg-card/40 backdrop-blur hover:bg-accent hover:text-accent-foreground hover:border-border',
```
to:
```tsx
        outline:
          'border border-border/80 bg-card/70 backdrop-blur hover:bg-accent hover:text-accent-foreground hover:border-border',
```
(Leave `destructive`, `secondary`, `ghost`, `link`, and `ai` variants unchanged — `ai` keeps `text-white` on the AI gradient, which is correct.)

- [ ] **Step 2: Typecheck + build**

Run:
```bash
pnpm --filter @ces/web typecheck && pnpm --filter @ces/web build
```
Expected: PASS.

- [ ] **Step 3: Visual check (both themes)**

Light: primary buttons have a subtle gloss (top highlight) + soft shadow, lift on hover; outline/secondary buttons read clearly on the light ground. Dark: buttons look as before.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/ui/button.tsx
git commit -m "feat(web): theme-aware button shadows + light-friendly outline"
```

---

### Task 5: Flagship motion — count-up + route transition

Add `framer-motion` interactions: animated KPI numerals and a per-route fade.

**Files:**
- Create: `apps/web/components/motion/count-up.tsx`
- Create: `apps/web/app/(app)/template.tsx`
- Modify: `apps/web/app/(app)/dashboard/page.tsx` (wrap top KPI numerals)

**Interfaces:**
- Produces: `CountUp` — `function CountUp(props: { value: number; decimals?: number; prefix?: string; suffix?: string; duration?: number }): JSX.Element`. Renders a `motion.span` that animates from 0 to `value` (locale `en-IN`), and renders the final value immediately under reduced motion.

- [ ] **Step 1: Create the CountUp component**

Create `apps/web/components/motion/count-up.tsx`:
```tsx
'use client';

import * as React from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';

export function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = 0.9,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) =>
    `${prefix}${v.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`,
  );

  React.useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, duration, reduce, mv]);

  return <motion.span className="num-display">{text}</motion.span>;
}
```

- [ ] **Step 2: Create the route-transition template**

Create `apps/web/app/(app)/template.tsx`:
```tsx
'use client';

import { motion, useReducedMotion } from 'framer-motion';

export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 3: Apply CountUp to the dashboard's primary KPI numerals**

Open `apps/web/app/(app)/dashboard/page.tsx`. Add the import:
```tsx
import { CountUp } from '@/components/motion/count-up';
```
Find the top metrics/KPI row (the headline numbers — e.g. portfolio totals, counts). For each primary numeric value, replace the raw rendered number with `<CountUp value={n} />`, preserving any currency/percent formatting via `prefix`/`suffix`/`decimals`. Example — if a card renders `{formatInr(total)}` showing `₹` and no decimals, render:
```tsx
<CountUp value={total} prefix="₹" />
```
Apply only to the top KPI row (1–5 numerals), not every number on the page (motion budget: 1–2 focal animations per view). If the dashboard is a server component, no `'use client'` change is needed — `CountUp` is already a client component and can be imported into a server page.

- [ ] **Step 4: Typecheck + build**

Run:
```bash
pnpm --filter @ces/web typecheck && pnpm --filter @ces/web build
```
Expected: PASS.

- [ ] **Step 5: Visual check**

Navigating between pages produces a brief upward fade (not a hard cut). On the dashboard, the top KPI numbers count up on load. Enable OS "reduce motion" → numbers render final immediately and the route fade is skipped, with layout intact.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/motion/count-up.tsx 'apps/web/app/(app)/template.tsx' 'apps/web/app/(app)/dashboard/page.tsx'
git commit -m "feat(web): framer-motion KPI count-up + per-route fade transition"
```

---

### Task 6: Per-page sweep — fix dark-only styling

Resolve every `text-white` / `dark:` / dark-assuming translucency so all pages read in light.

**Files:**
- Modify (as needed): the files surfaced by the greps below. Known candidates:
  `apps/web/components/sidebar.tsx`, `apps/web/app/(app)/expenses/page.tsx`,
  `apps/web/app/(app)/projects/page.tsx`, `apps/web/app/(app)/projects/onboard/page.tsx`,
  `apps/web/app/(app)/dashboard/page.tsx`, `apps/web/app/(auth)/login/page.tsx`,
  `apps/web/app/(app)/attendance/page.tsx`.

**Interfaces:** none (visual correctness only).

- [ ] **Step 1: Enumerate the hits**

Run from `apps/web`:
```bash
grep -rn 'text-white' app components ; echo '---' ; grep -rn 'dark:' app components ; echo '---' ; grep -rn 'bg-card/40\|bg-background/[0-9]\|/40 \|text-white/' app components
```
Expected: the `text-white` list (7 files) + the single `dark:` file + any translucency hits. For each hit, classify it (next step).

- [ ] **Step 2: Fix each hit by rule**

For every hit, apply:
- **`text-white` on a colored/gradient fill** (e.g. `.brand-surface`, `.ai-surface`, the `ai` button, a colored badge): **leave it** — white-on-color is correct in both themes.
- **`text-white` on a surface that is now light** (a card/background that used to be dark): change to `text-foreground` (or the appropriate semantic token).
- **`dark:` variant** in `app/(app)/attendance/page.tsx`: if it assumed a dark base, convert the base utility to a semantic token so it works in light, keeping the `dark:` override only if it still adds value.
- **`bg-card/40`** or similar low-opacity fills meant for dark glass: bump to a token-based value that reads on light (e.g. `bg-card/70`) or use `.glass`.

Make the minimal edit per file; do not restructure layouts.

- [ ] **Step 3: Sidebar specifically**

In `apps/web/components/sidebar.tsx`, verify the shell reads on light: the `bg-card/40 backdrop-blur-xl` aside and the active-item gradient should look intentional on the aurora ground. If the aside is too transparent on light, change `bg-card/40` to `bg-card/70`. The brand `CES` mark keeps `text-white` on its `.brand-surface` gradient (correct — do not change).

- [ ] **Step 4: Build**

Run:
```bash
pnpm --filter @ces/web build
```
Expected: PASS.

- [ ] **Step 5: Visual walk (both themes)**

Walk every major route in **light**: dashboard, projects + a project's P&L tab, expenses, attendance, leave, travel, approvals, finance/invoices, finance/payslips, admin/grades, projects/onboard, and the login page. Confirm: no white-on-white text, no invisible borders, no element that only makes sense on a dark background. Toggle to **dark** and confirm each page still looks correct.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/app apps/web/components
git commit -m "fix(web): sweep dark-only styling so all pages read in light theme"
```

---

### Task 7: Docs + memory + final verification pass

**Files:**
- Modify: `CLAUDE.md` (UI shell note)
- Modify: `/Users/surajsoni/.claude/projects/-Users-surajsoni-Documents-CES-Expense-Tool/memory/ui_redesign.md` and its `MEMORY.md` pointer line

- [ ] **Step 1: Update CLAUDE.md UI-shell note**

In `CLAUDE.md`, in the "UI shell" paragraph of §7, replace the "Linear-style dark theme by default" description with a sentence noting the new default: light "glass" theme (frosted glass surfaces, aurora+grid ground, glossy buttons, blue→cyan AI accents, IBM Plex), with the dark "operations console" theme retained behind a `next-themes` toggle; flagship motion via `framer-motion` (KPI count-up + route fade) atop the CSS `.reveal`/`.lift` utilities.

- [ ] **Step 2: Update project memory (the reversal)**

Edit `~/.claude/projects/-Users-surajsoni-Documents-CES-Expense-Tool/memory/ui_redesign.md` so it records the current truth: **light "glass" theme is the default; dark is a toggle (not the hero).** Keep a one-line note that the prior dark-default decision was reversed on 2026-06-23 per user direction. Update the matching pointer line in that folder's `MEMORY.md` if its hook text still says "dark".

- [ ] **Step 3: Final verification pass**

Run from repo root:
```bash
pnpm --filter @ces/web typecheck && pnpm --filter @ces/web build
```
Then in the dev server, with **light** default: spot-check text contrast on glass surfaces (body text should be clearly legible — the navy `--foreground` on ≥0.72 white glass is well above 4.5:1); verify the responsive layout at 375 / 768 / 1024 / 1440 (no horizontal scroll, glass/aurora hold); enable reduced motion and confirm count-up + route fade collapse to instant. Toggle to **dark** and confirm parity.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(web): record light-glass default theme (dark retained as toggle)"
```

---

## Self-Review

**Spec coverage:**
- Theme architecture / default-to-light / toggle / dark preserved → Task 1. ✓
- Palette retune + glass/gloss tokens + AI blue→cyan + darkened muted-fg → Task 2. ✓
- Background aurora + grid graphics → Task 3. ✓
- Gloss buttons / primitives → Task 4 (cards covered by Task 2's `.glass`/`.lift` tokenization). ✓
- Motion system (CSS-first already in `globals.css`; framer flagship count-up + route fade) → Task 5; reduced-motion honored in Tasks 5 + existing media query. ✓
- Per-page sweep of ~8 bespoke files → Task 6. ✓
- Testing (typecheck/build + dual-theme visual walk + contrast + reduced-motion + responsive) → in every task + Task 7. ✓
- Docs + memory reversal → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The only judgment-based step is Task 5 Step 3 (which dashboard numerals to wrap) and Task 6 Step 2 (classify each grep hit) — both give explicit decision rules rather than "handle appropriately", which is appropriate since the exact lines depend on files the executor reads.

**Type consistency:** `CountUp` props `{ value, decimals?, prefix?, suffix?, duration? }` are defined once (Task 5 Step 1) and used consistently (Task 5 Step 3). The CSS tokens `--glass-bg/--glass-border/--gloss-highlight/--shadow-card/--shadow-card-hover/--shadow-btn` are defined in both `:root` and `.dark` (Task 2 Steps 1–2) before being consumed by `.glass`/`.lift` (Task 2 Steps 3–4) and `Button` (Task 4). Consistent.
