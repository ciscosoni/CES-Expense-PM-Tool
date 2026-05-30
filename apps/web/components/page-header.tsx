import * as React from 'react';
import { cn } from '@/lib/cn';

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 pb-5', className)}>
      <div className="reveal min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-gradient">{title}</h1>
        {description && (
          <div className="mt-1.5 text-sm text-muted-foreground">{description}</div>
        )}
      </div>
      {actions && (
        <div className="reveal flex flex-shrink-0 items-center gap-2" style={{ ['--i' as string]: 1 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
