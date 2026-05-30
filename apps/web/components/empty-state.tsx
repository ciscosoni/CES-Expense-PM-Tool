import * as React from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Polished empty state — a glass icon medallion, a title, and an optional hint
 * line. Used for empty tables, inboxes, and lists across the app.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="relative mb-4">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle,hsl(var(--glow)/0.25),transparent_70%)] blur-lg"
        />
        <div className="grid h-12 w-12 place-items-center rounded-xl border border-border/70 bg-elevated/50 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="text-sm font-medium text-foreground/90">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
