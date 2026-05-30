'use client';

import * as React from 'react';

/**
 * Count-up animation for KPI numerals. Respects prefers-reduced-motion and
 * renders the final value on first paint to avoid layout shift, then animates
 * from 0 once mounted.
 *
 * Formatting is driven by serializable props only (no function props) so this
 * can be rendered directly from server components.
 */
export function AnimatedNumber({
  value,
  duration = 1000,
  decimals = 0,
  money = false,
  percent = false,
  currency = 'INR',
  prefix = '',
  suffix = '',
  placeholder,
  className,
}: {
  value: number;
  duration?: number;
  decimals?: number | undefined;
  money?: boolean | undefined;
  percent?: boolean | undefined;
  currency?: string | undefined;
  prefix?: string;
  suffix?: string;
  /** When set, rendered verbatim instead of the animated number (e.g. "—"). */
  placeholder?: string | undefined;
  className?: string;
}) {
  const [display, setDisplay] = React.useState(value);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (placeholder != null) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(value * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, placeholder]);

  if (placeholder != null) {
    return <span className={className}>{placeholder}</span>;
  }

  const num = display.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const text = money ? `${currency} ${num}` : percent ? `${num}%` : num;

  return (
    <span className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
