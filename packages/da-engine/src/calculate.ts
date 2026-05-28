import Decimal from 'decimal.js';
import type {
  CityTier,
  DaPolicy,
  EntitlementMatrixRow,
  Id,
  IsoDate,
  Money,
  MoneyAmount,
} from '@ces/domain';
import { resolveEffective } from './effective.js';

export interface DaInput {
  gradeId: Id;
  cityTier: CityTier;
  /** Inclusive start date (YYYY-MM-DD). */
  startDate: IsoDate;
  /** Inclusive end date (YYYY-MM-DD). */
  endDate: IsoDate;
  /** Intra-city same-day work => no overnight DA per §4.2 unless policy says so. */
  tripType: 'INTER_CITY' | 'INTRA_CITY';
  /** All entitlement rows for the grade × tier; engine picks the one effective per day. */
  entitlements: readonly EntitlementMatrixRow[];
  /** All DA policies; engine picks the one effective per day. */
  policies: readonly DaPolicy[];
}

export interface DaDayBreakdown {
  date: IsoDate;
  /** 0..1 (fractional). 0 means no DA paid that day. */
  factor: number;
  perDiem: MoneyAmount;
  amount: MoneyAmount;
  currency: string;
  /** Why this day's factor came out as it did. Helps the audit log. */
  reason: 'FULL_DAY' | 'DEPARTURE_DAY' | 'RETURN_DAY' | 'INTRA_CITY_NO_OVERNIGHT';
}

export interface DaResult {
  eligibleDays: number;
  total: Money;
  breakdown: readonly DaDayBreakdown[];
}

/**
 * Pure DA calculator. No I/O. No DB. Inputs in, money out.
 *
 * Rules implemented (all configurable via DaPolicy / EntitlementMatrixRow):
 *   - Per-day amount comes from EntitlementMatrixRow effective on that date (§4.1)
 *   - Departure and return days are prorated by DaPolicy.partialDayPercent (§4.2)
 *   - Intra-city same-day trips do not earn overnight DA unless policy overrides (§4.2)
 *   - Single-day inter-city trips count as one full day
 *   - Currency is taken from the entitlement row; mixing currencies across days throws
 */
export function calculateDa(input: DaInput): DaResult {
  if (input.startDate > input.endDate) {
    throw new Error(`DA: startDate ${input.startDate} is after endDate ${input.endDate}`);
  }

  const allDates = enumerateDates(input.startDate, input.endDate);

  // Intra-city same-day: zero DA unless policy overrides on the start date.
  if (input.tripType === 'INTRA_CITY' && allDates.length === 1) {
    const policy = resolveEffective(input.policies, input.startDate);
    const ent = pickEntitlement(input.entitlements, input.gradeId, input.cityTier, input.startDate);
    if (!policy?.intraCitySameDayPaysDa) {
      return {
        eligibleDays: 0,
        total: { amount: '0.00', currency: ent.perDiemCurrency },
        breakdown: [
          {
            date: input.startDate,
            factor: 0,
            perDiem: ent.perDiemAmount,
            amount: '0.00',
            currency: ent.perDiemCurrency,
            reason: 'INTRA_CITY_NO_OVERNIGHT',
          },
        ],
      };
    }
  }

  const breakdown: DaDayBreakdown[] = [];
  let total = new Decimal(0);
  let totalDays = new Decimal(0);
  let currency: string | undefined;

  for (let i = 0; i < allDates.length; i++) {
    const date = allDates[i]!;
    const ent = pickEntitlement(input.entitlements, input.gradeId, input.cityTier, date);
    const policy = resolveEffective(input.policies, date);
    if (!policy) {
      throw new Error(`DA: no policy effective on ${date}`);
    }

    currency ??= ent.perDiemCurrency;
    if (ent.perDiemCurrency !== currency) {
      throw new Error(
        `DA: currency mismatch on ${date} (${ent.perDiemCurrency} vs ${currency}). ` +
          `Multi-currency single trip not supported.`,
      );
    }

    const isFirst = i === 0;
    const isLast = i === allDates.length - 1;
    const isSingleDay = allDates.length === 1;

    let factor: number;
    let reason: DaDayBreakdown['reason'];

    if (isSingleDay) {
      // Single full day (inter-city), or policy-enabled intra-city — treat as a full day.
      factor = 1;
      reason = 'FULL_DAY';
    } else if (isFirst) {
      factor = policy.partialDayPercent;
      reason = 'DEPARTURE_DAY';
    } else if (isLast) {
      factor = policy.partialDayPercent;
      reason = 'RETURN_DAY';
    } else {
      factor = 1;
      reason = 'FULL_DAY';
    }

    const perDiem = new Decimal(ent.perDiemAmount);
    const dayAmount = perDiem.mul(factor);

    breakdown.push({
      date,
      factor,
      perDiem: ent.perDiemAmount,
      amount: dayAmount.toFixed(2),
      currency: ent.perDiemCurrency,
      reason,
    });

    total = total.plus(dayAmount);
    totalDays = totalDays.plus(factor);
  }

  return {
    eligibleDays: totalDays.toNumber(),
    total: {
      amount: total.toFixed(2),
      currency: currency ?? 'INR',
    },
    breakdown,
  };
}

function pickEntitlement(
  rows: readonly EntitlementMatrixRow[],
  gradeId: Id,
  cityTier: CityTier,
  onDate: IsoDate,
): EntitlementMatrixRow {
  const filtered = rows.filter((r) => r.gradeId === gradeId && r.cityTier === cityTier);
  const ent = resolveEffective(filtered, onDate);
  if (!ent) {
    throw new Error(
      `DA: no entitlement effective for grade ${gradeId} × tier ${cityTier} on ${onDate}`,
    );
  }
  return ent;
}

function enumerateDates(start: IsoDate, end: IsoDate): IsoDate[] {
  const dates: IsoDate[] = [];
  // Parse as UTC to avoid timezone drift around DST/midnight.
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const oneDay = 24 * 60 * 60 * 1000;
  for (let ms = startMs; ms <= endMs; ms += oneDay) {
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return dates;
}
