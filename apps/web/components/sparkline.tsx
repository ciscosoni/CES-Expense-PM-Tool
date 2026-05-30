'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Inline trend visualization for KPI cards. Pure SVG (no charting lib) with a
 * gradient area fill, smooth catmull-rom-ish curve, an end-point glow dot, and
 * a one-shot draw-in animation. Pass 2+ values.
 */
export function Sparkline({
  values,
  width = 132,
  height = 36,
  className,
  tone = 'primary',
  fill = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  tone?: 'primary' | 'positive' | 'negative' | 'muted' | 'ai';
  fill?: boolean;
}) {
  const uid = React.useId().replace(/:/g, '');
  if (values.length < 2) {
    return <div className={cn('h-9', className)} aria-hidden />;
  }
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (width - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => ({
    x: pad + i * step,
    y: pad + (height - pad * 2) - ((v - min) / range) * (height - pad * 2),
  }));

  // Smooth curve via simple cubic interpolation between points.
  const line = pts.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p.x},${p.y}`;
    const prev = arr[i - 1]!;
    const cx = (prev.x + p.x) / 2;
    return `${acc} C ${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`;
  }, '');
  const area = `${line} L ${pts[pts.length - 1]!.x},${height} L ${pts[0]!.x},${height} Z`;

  const last = pts[pts.length - 1]!;
  const trend = values[values.length - 1]! >= values[0]!;

  const stroke = {
    primary: 'hsl(var(--primary))',
    positive: 'hsl(var(--success))',
    negative: 'hsl(var(--destructive))',
    muted: 'hsl(var(--muted-foreground))',
    ai: `url(#sg-${uid})`,
  }[tone];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      role="img"
      aria-label={`Trend ${trend ? 'up' : 'down'}`}
    >
      <defs>
        <linearGradient id={`sg-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--ai-from))" />
          <stop offset="50%" stopColor="hsl(var(--ai-via))" />
          <stop offset="100%" stopColor="hsl(var(--ai-to))" />
        </linearGradient>
        <linearGradient id={`sf-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone === 'ai' ? 'hsl(var(--ai-via))' : stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={tone === 'ai' ? 'hsl(var(--ai-via))' : stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#sf-${uid})`} />}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 1000,
          animation: 'draw-line 1.1s cubic-bezier(0.22,1,0.36,1) forwards',
          // @ts-expect-error custom prop consumed by keyframe
          '--len': 1000,
        }}
      />
      <circle cx={last.x} cy={last.y} r={3.5} fill={stroke} opacity={0.25} />
      <circle cx={last.x} cy={last.y} r={2} fill={stroke} />
    </svg>
  );
}
