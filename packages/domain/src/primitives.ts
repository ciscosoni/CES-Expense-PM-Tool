import { z } from 'zod';

/**
 * ISO 4217 currency code. INR is the platform default; foreign currency is allowed for
 * international DA per §11 of the brief.
 */
export const CurrencyCode = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/);
export type CurrencyCode = z.infer<typeof CurrencyCode>;

/**
 * Monetary amount stored as a string-encoded decimal to avoid float drift.
 * All money math is done in a decimal library, never in JS Number.
 */
export const MoneyAmount = z.string().regex(/^-?\d+(\.\d{1,4})?$/);
export type MoneyAmount = z.infer<typeof MoneyAmount>;

export const Money = z.object({
  amount: MoneyAmount,
  currency: CurrencyCode,
});
export type Money = z.infer<typeof Money>;

/** YYYY-MM-DD calendar date (no time, no zone). */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type IsoDate = z.infer<typeof IsoDate>;

export const IsoDateTime = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const Id = z.string().uuid();
export type Id = z.infer<typeof Id>;
