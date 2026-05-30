import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Sparkline } from '@/components/sparkline';
import { AnimatedNumber } from '@/components/animated-number';
import { cn } from '@/lib/cn';

type Tone = 'primary' | 'positive' | 'negative' | 'muted';

const ICON_TINT: Record<Tone, string> = {
  primary: 'text-primary',
  positive: 'text-success',
  negative: 'text-destructive',
  muted: 'text-muted-foreground',
};

/**
 * Shared KPI / metric tile used across the dashboard, project P&L, approvals,
 * etc. Server-renderable: animation + sparkline are client components but take
 * only serializable props.
 */
export function StatCard({
  label,
  value,
  money,
  percent,
  decimals,
  currency,
  placeholder,
  hint,
  icon,
  spark,
  tone = 'primary',
  index = 0,
  href,
  className,
}: {
  label: React.ReactNode;
  value: number;
  money?: boolean | undefined;
  percent?: boolean | undefined;
  decimals?: number | undefined;
  currency?: string | undefined;
  placeholder?: string | undefined;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  spark?: number[];
  tone?: Tone;
  index?: number;
  href?: string;
  className?: string;
}) {
  const body = (
    <Card
      interactive
      className={cn('reveal h-full p-4', className)}
      style={{ ['--i' as string]: index }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--glow)/0.9),transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && (
            <span
              className={cn(
                'grid h-7 w-7 place-items-center rounded-lg border border-border/60 bg-elevated/60 transition-colors group-hover:border-primary/40',
                ICON_TINT[tone],
              )}
            >
              {icon}
            </span>
          )}
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        {spark && spark.length > 1 ? (
          <Sparkline values={spark} tone={tone} width={88} height={30} />
        ) : href ? (
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
        ) : null}
      </div>
      <div className="mt-3 text-[26px] font-semibold leading-none tracking-tight num-display">
        <AnimatedNumber
          value={value}
          money={money}
          percent={percent}
          decimals={decimals}
          currency={currency}
          placeholder={placeholder}
        />
      </div>
      {hint && <div className="mt-2 truncate text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none">
        {body}
      </Link>
    );
  }
  return body;
}
