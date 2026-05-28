import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional className combiner with Tailwind-aware dedupe. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
