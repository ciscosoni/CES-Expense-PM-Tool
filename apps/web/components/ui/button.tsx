'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[var(--shadow-btn)] hover:bg-primary/90 hover:shadow-[0_6px_18px_-6px_hsl(var(--glow)/0.5)]',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-[0_4px_16px_-4px_hsl(var(--destructive)/0.5)]',
        outline:
          'border border-border/80 bg-card/70 backdrop-blur hover:bg-accent hover:text-accent-foreground hover:border-border',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        ai: 'text-white shadow-[0_2px_16px_-4px_hsl(var(--ai-via)/0.6)] bg-[linear-gradient(110deg,hsl(var(--ai-from)),hsl(var(--ai-via)),hsl(var(--ai-to)))] hover:shadow-[0_4px_24px_-4px_hsl(var(--ai-via)/0.8)] hover:brightness-110',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-lg px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
