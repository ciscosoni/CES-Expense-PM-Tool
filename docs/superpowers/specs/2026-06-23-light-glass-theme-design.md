# Light Glass — premium light theme (whole-app re-skin)

**Date:** 2026-06-23
**Status:** Design — awaiting user approval
**Author:** Claude (brainstorming session)

---

## 0. Context & decision

The team is moving off Workway and the user wants the web app to feel **premium, light, glossy,
dynamic, and professional** — a white-background experience with rich motion and graphics. This
**reverses the previously-locked dark "operations console" theme** (recorded in project memory
`ui_redesign.md`); the user's current instruction takes precedence. Memory must be updated.

Key finding that makes this tractable: the app is already **token-driven**. `globals.css` defines a
light `:root` and a `.dark` block; dark is currently *forced* via `className="dark"` on `<html>`
(`app/layout.tsx:30`). Across 73 `.tsx` files there are **0 hardcoded-hex backgrounds, 7 `text-white`,
1 `dark:` file**. So re-skinning the `:root` light tokens + shared primitives propagates app-wide;
the bespoke per-page sweep is ~8 files.

### Locked decisions (this session)
- **Light is the default; dark is retained behind a toggle** (not deleted).
- Aesthetic: **glossy-glass premium with refined-corporate discipline** — frosted glass + gloss, but
  enterprise-serious, not toy-like.
- Scope: **whole web app in one pass** (feasible because it's token-driven).
- Motion: **CSS-first everywhere + `framer-motion` on flagship pages** (dashboard count-up, staggered
  reveals, route fades).
- Typography: **keep IBM Plex Sans/Mono** (already wired via `next/font`, tabular-nums on).
- Mobile (`apps/mobile`) is **out of scope** — web only.

### Relationship to other work
This theme is foundational and should land **before** the parked Slice-0 Workway nav re-org
(`2026-06-23-workway-nav-reorg-design.md`), so the new nav inherits the glass look automatically.

## 1. Goals / non-goals

**Goals:** a cohesive premium light theme as the default; preserved dark mode via toggle; glossy
glass surfaces + gloss buttons; a reusable motion system; subtle background graphics; AA contrast;
reduced-motion support; every existing page reads correctly in both themes.

**Non-goals:** no information-architecture / nav changes (that's the nav slice); no new product
features; no mobile app changes; no font swap; no Prisma/API changes.

## 2. Design constitution check

The visibility-first principle is served (richer, more legible dashboards). The change is presentation
only — it does not touch evidence, P&L, DA, or approval logic, so the "computed, never entered"
guarantees are unaffected.

## 3. Theme architecture

1. **Default to light.** Remove `dark` from the `<html>` className in `app/layout.tsx`. Add
   **`next-themes`** `ThemeProvider` inside the existing `components/providers.tsx`, with
   `attribute="class"`, `defaultTheme="light"`, `enableSystem={false}` (explicit light default;
   user opts into dark). `suppressHydrationWarning` is already present → no flash.
2. **Toggle.** A small sun/moon toggle in the app topbar (and/or sidebar footer) calling
   `setTheme`. Persists via next-themes localStorage.
3. **Dark preserved.** The existing `.dark` block in `globals.css` is kept verbatim; only the light
   `:root` and shared layers are reworked.

## 4. Palette (light `:root`)

Corporate blue retained as primary; navy ink for authority; glass for surfaces. Values are HSL
(matching the existing token format).

| Token | Light value | Purpose |
|---|---|---|
| `--background` | `0 0% 100%` (painted by the aurora layer, §6) | base |
| `--foreground` | `222 47% 11%` | body ink |
| `--card` / `--popover` | `0 0% 100%` (glass uses translucency, §5) | surfaces |
| `--elevated` | `240 30% 99%` | raised fills |
| `--primary` | `219 90% 54%` (kept) | actions, active nav |
| `--primary-foreground` | `0 0% 100%` | on-primary |
| `--ink-strong` (new) | `222 47% 18%` | headings / sidebar authority weight |
| `--secondary` / `--muted` / `--accent` | `240 5% 96%` (kept) | subtle fills |
| `--muted-foreground` | `240 4% 40%` (darkened from 46% for AA on glass) | secondary text |
| `--success` / `--warning` / `--destructive` | `152 60% 40%` / `38 92% 50%` / `0 72% 51%` (kept) | semantics |
| `--border` / `--input` | `240 6% 90%` (kept) | hairlines |
| `--ring` | `219 90% 54%` | focus |
| `--ai-from / via / to` | `222 90% 62%` → `210 90% 60%` → `192 92% 58%` | **retuned blue→cyan** (was purple; skill: avoid AI purple/pink) |
| `--glow` | `219 90% 54%` | soft blue glow (lighter than dark) |

New gloss/shadow tokens (light):
- `--shadow-sm: 0 1px 2px hsl(222 47% 11% / 0.05)`
- `--shadow-glass: 0 1px 2px hsl(222 47% 11% / 0.04), 0 8px 24px -10px hsl(222 47% 11% / 0.12)`
- `--gloss-highlight: inset 0 1px 0 hsl(0 0% 100% / 0.7)`
- `--shadow-lg: 0 12px 32px -12px hsl(222 47% 11% / 0.18)`

Contrast: every foreground/surface pair must verify ≥ 4.5:1 (normal text). `--muted-foreground` is
darkened specifically because glass surfaces are translucent.

## 5. Gloss + glass primitives

- **`.glass` surface utility:** `background: hsl(0 0% 100% / 0.72); backdrop-filter: blur(12px)
  saturate(1.4); border: 1px solid hsl(0 0% 100% / 0.6); box-shadow: var(--shadow-glass),
  var(--gloss-highlight);`. With a solid fallback when `backdrop-filter` is unsupported
  (`@supports not`).
- **Card** (`components/ui/card.tsx`): adopt the glass utility; remove dark-assuming opacity like
  `bg-card/40`.
- **Button** (`components/ui/button.tsx`): primary variant gets a subtle vertical gradient
  (`hsl(var(--primary)) → hsl(var(--primary)/0.92)`) + `--gloss-highlight` + `--shadow-sm`; hover
  `translateY(-1px)` + shadow grow; transitions 150–200ms. One primary CTA per screen.
- **Badge / Input / Sidebar / Topbar:** restyle to light-glass via tokens; keep consistent elevation
  scale (sm / glass / lg) — no ad-hoc shadows.

## 6. Background graphics (the "graphics" feel)

Mirror the dark theme's `body::before/::after`, retuned for light:
- `body::before`: soft **aurora wash** — two faint radial gradients (blue ↖, cyan ↗) at ~6–10%
  opacity over white, fixed.
- `body::after`: a **barely-there grid** (`hsl(var(--border)/0.5)` 1px lines) for subtle depth.
- Both sit behind content (`z-index: -1`). They are **static** (no animation), so they stay on under
  `prefers-reduced-motion`. Hero/KPI cards may use a gradient top-border accent.

This tinted ground is what makes translucent glass read on a "white" page.

## 7. Motion system

- **`lib/motion.ts`** — shared tokens + framer variants: `fadeRise` (opacity 0→1, y 8→0),
  `staggerContainer` (children delay 30–50ms), `hoverLift`. Easing: ease-out enter, faster exit
  (~65% of enter).
- **CSS layer** (globals.css + `tailwindcss-animate`): keyframes for fade-rise + stagger utility
  classes, applied broadly so non-flagship pages animate without importing framer.
- **`framer-motion`** (new dep) used on flagship pages only: dashboard **KPI count-up**, staggered
  panel reveal, and a route-change fade via an app `template.tsx`.
- **Reduced motion:** a global `@media (prefers-reduced-motion: reduce)` collapses animations to
  instant; framer variants read `useReducedMotion()` and skip transforms.
- Constraints: animate transform/opacity only; 150–300ms micro, ≤400ms complex; never block input.

## 8. Per-page sweep (the ~8 bespoke files)

Audit and fix files using `text-white` / `dark:` / dark-assuming translucency so they read on light:
- `components/sidebar.tsx` — `bg-card/40 backdrop-blur-xl` and active-gradient tuned for light glass;
  brand "CES" mark keeps `text-white` on its blue gradient (correct).
- The other `text-white` occurrences (badges/brand surfaces on colored fills) — verify each sits on a
  colored background; leave if correct, tokenize if it assumed dark.
- The single `dark:` file — confirm it still makes sense with light default.

Deliverable: grep `text-white|dark:|bg-\w+/\d0\b` across `app components`, resolve each hit.

## 9. Testing & verification

- `pnpm --filter @ces/web typecheck` and `build` green.
- **Visual walk of every major route in BOTH themes** (light default; toggle to dark): dashboard,
  projects + P&L tab, expenses, attendance, leave, travel, approvals, finance/*, admin/*, onboard.
- Contrast: spot-check text on glass surfaces ≥ 4.5:1 (use the darkened `--muted-foreground`).
- Reduced-motion: enable OS setting → confirm animations collapse, layout intact.
- Responsive: 375 / 768 / 1024 / 1440 — glass/aurora/motion hold, no horizontal scroll.
- No-flash: hard refresh in light and in dark — no theme flicker.

## 10. Risks & mitigations

- **Glass invisible on pure white** → the aurora-tinted ground (§6) gives glass contrast; cards also
  carry a hairline border + shadow.
- **`backdrop-filter` perf / support** → cap blur layers; `@supports not` solid fallback; avoid
  stacking many blurred layers in long lists.
- **Contrast on translucency** → surfaces sit at ≥ 0.72 opacity; `--muted-foreground` darkened;
  verified in testing.
- **Hidden dark assumptions** beyond the grep (e.g. components relying on the dark body glow) → caught
  in the both-theme visual walk.
- **next-themes hydration flash** → `attribute="class"` + existing `suppressHydrationWarning`.

## 11. Definition of done

- Light is the default; dark reachable via a working topbar toggle; no flash.
- `globals.css` light tokens + gloss/shadow/motion tokens + aurora/grid layer + retuned AI gradient
  shipped; `.dark` preserved.
- Glass/gloss applied to shared primitives; ~8 bespoke files swept.
- `lib/motion` + flagship framer interactions (dashboard count-up + staggered reveal + route fade).
- typecheck + build green; both-theme visual walk clean; reduced-motion + responsive verified.
- `CLAUDE.md` UI-shell note updated; project memory `ui_redesign.md` updated to record the light
  default + dark-as-toggle reversal.
