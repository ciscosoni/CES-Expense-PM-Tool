'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Tiny inline trend visualization for KPI cards. Pure SVG, no charting lib —
 * keeps the bundle small and renders instantly with no layout shift.
 *
 * Pass 2+ values. The line auto-scales to its container width.
 */
export function Sparkline({
  values,
  width = 120,
  height = 28,
  className,
  tone = 'primary',
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  tone?: 'primary' | 'positive' | 'negative' | 'muted' | 'ai';
}) {
  if (values.length < 2) {
    return <div className={cn('h-7', className)} aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(' ');

  const last = values[values.length - 1]!;
  const first = values[0]!;
  const trend = last >= first;

  const toneClass = {
    primary: 'stroke-primary',
    positive: 'stroke-emerald-400',
    negative: 'stroke-red-400',
    muted: 'stroke-muted-foreground',
    ai: 'stroke-[url(#sparkline-ai-gradient)]',
  }[tone];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('overflow-visible', className)}
      role="img"
      aria-label={`Trend ${trend ? 'up' : 'down'} from ${first} to ${last}`}
    >
      {tone === 'ai' && (
        <defs>
          <linearGradient id="sparkline-ai-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--ai-from))" />
            <stop offset="50%" stopColor="hsl(var(--ai-via))" />
            <stop offset="100%" stopColor="hsl(var(--ai-to))" />
          </linearGradient>
        </defs>
      )}
      <polyline
        fill="none"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className={toneClass}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={(values.length - 1) * step}
        cy={height - ((last - min) / range) * height}
        r={2.5}
        className={cn('fill-current', toneClass)}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
