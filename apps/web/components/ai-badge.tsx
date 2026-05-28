import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Compact "AI-powered" indicator. Use it sparingly: only on UI affordances
 * that actually call an LLM (onboarding wizard, insight feed, smart suggestions).
 * Over-using it dilutes the signal.
 */
export function AiBadge({ label = 'AI', className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
        'bg-gradient-to-r from-[hsl(var(--ai-from)/0.18)] via-[hsl(var(--ai-via)/0.14)] to-[hsl(var(--ai-to)/0.18)]',
        'ai-gradient-text border border-[hsl(var(--ai-via)/0.35)]',
        className,
      )}
    >
      <Sparkles className="h-3 w-3 text-[hsl(var(--ai-via))]" />
      {label}
    </span>
  );
}
