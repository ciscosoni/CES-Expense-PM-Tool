import Decimal from 'decimal.js';
import type {
  BillingModel,
  CurrencyCode,
  Id,
  IsoDate,
  Milestone,
  Money,
  MoneyAmount,
} from '@ces/domain';

/**
 * Time-versioned cost rate per grade (subset of @ces/domain CostRate, lifted here so
 * the engine has no DB dependency).
 */
export interface EffectiveCostRate {
  gradeId: Id;
  ratePerDay: MoneyAmount;
  currency: CurrencyCode;
  effectiveFrom: IsoDate;
}

/** Time-versioned bill rate per grade — what we charge the client (T&M). Same shape as cost rate. */
export type EffectiveBillRate = EffectiveCostRate;

export interface TimeLogEntry {
  /** The engineer's grade *as of the log date* — caller is responsible for resolving. */
  gradeId: Id;
  date: IsoDate;
  /** Hours worked. Converted to days at 8h/day for cost calc (configurable later). */
  hours: number;
  /** Whether this time is billable to the client (T&M revenue). Defaults to true. */
  billable?: boolean;
}

export interface TripCostEntry {
  travel: MoneyAmount;
  lodging: MoneyAmount;
  da: MoneyAmount;
  localConveyance: MoneyAmount;
  currency: CurrencyCode;
}

export interface ExpenseEntry {
  amount: MoneyAmount;
  currency: CurrencyCode;
}

export interface PnlInput {
  /** Currency the P&L is reported in. All inputs must already be in this currency. */
  reportingCurrency: CurrencyCode;
  billingModel: BillingModel;
  /** Contract value — used for FIXED_PRICE. */
  contractValue: MoneyAmount;
  /** Required for MILESTONE — revenue = sum of signed-off milestones. */
  milestones?: readonly Milestone[];
  /** T_AND_M fallback — used when `billRates` is not supplied. */
  tmBillingTotal?: MoneyAmount;
  /** All time logs against the project. */
  timeLogs: readonly TimeLogEntry[];
  /** All cost-rate rows; engine picks the row effective on each log date. */
  costRates: readonly EffectiveCostRate[];
  /** Bill-rate rows (T_AND_M revenue = Σ billable hours × bill rate effective on log date). */
  billRates?: readonly EffectiveBillRate[];
  /** Closed trips on the project (DA + travel + lodging + local conveyance). */
  tripCosts: readonly TripCostEntry[];
  /** Approved reimbursable expenses (not yet covered by a trip). */
  otherExpenses: readonly ExpenseEntry[];
  /** Manually entered direct project costs not from the categories above. */
  otherDirectCosts: readonly ExpenseEntry[];
  /** Hours-to-day conversion used for effort cost. Default 8 (configurable later). */
  hoursPerDay?: number;
}

export interface PnlCostBreakdown {
  effort: MoneyAmount;
  travel: MoneyAmount;
  lodging: MoneyAmount;
  da: MoneyAmount;
  localConveyance: MoneyAmount;
  otherExpenses: MoneyAmount;
  otherDirect: MoneyAmount;
  total: MoneyAmount;
}

export interface PnlResult {
  revenue: Money;
  cost: Money;
  costBreakdown: PnlCostBreakdown;
  grossProfit: Money;
  /** Margin % as a number with 2-decimal precision (e.g. 23.50). Null when revenue is 0. */
  marginPercent: number | null;
}

/**
 * Pure project P&L roll-up.
 *
 * Revenue per billing model:
 *   - FIXED_PRICE → contractValue
 *   - MILESTONE   → Σ value of milestones with signedOffDate != null
 *   - T_AND_M     → caller-provided `tmBillingTotal`
 *
 * Cost = effort + travel + lodging + DA + local conveyance + other expenses + other direct.
 * Effort cost = Σ (hours / hoursPerDay) × CostRate(gradeId effective on log date).
 *
 * v1 is services-only. Hardware/OEM pass-through is reserved for v2 (via Project.includesPassthrough)
 * and is not summed here — keeping margin % comparable across projects.
 *
 * All inputs must already be in `reportingCurrency`; FX conversion happens upstream.
 */
export function calculatePnl(input: PnlInput): PnlResult {
  const hoursPerDay = input.hoursPerDay ?? 8;

  // Revenue
  let revenue = new Decimal(0);
  switch (input.billingModel) {
    case 'FIXED_PRICE':
      revenue = new Decimal(input.contractValue);
      break;
    case 'MILESTONE': {
      if (!input.milestones) {
        throw new Error('PnL: MILESTONE billing requires `milestones` input');
      }
      for (const m of input.milestones) {
        if (m.signedOffDate) {
          if (m.currency !== input.reportingCurrency) {
            throw new Error(
              `PnL: milestone currency ${m.currency} != reporting ${input.reportingCurrency}`,
            );
          }
          revenue = revenue.plus(m.value);
        }
      }
      break;
    }
    case 'T_AND_M':
      if (input.billRates && input.billRates.length > 0) {
        // Revenue from billable time × bill rate effective on each log date.
        for (const log of input.timeLogs) {
          if (log.billable === false) continue;
          const br = pickCostRate(input.billRates, log.gradeId, log.date);
          if (br.currency !== input.reportingCurrency) {
            throw new Error(
              `PnL: bill rate currency ${br.currency} != reporting ${input.reportingCurrency}`,
            );
          }
          revenue = revenue.plus(new Decimal(log.hours).div(hoursPerDay).mul(br.ratePerDay));
        }
      } else if (input.tmBillingTotal !== undefined) {
        revenue = new Decimal(input.tmBillingTotal);
      }
      // else: no bill rates and no total → revenue 0 (don't throw; keeps dashboards resilient).
      break;
  }

  // Effort cost
  let effort = new Decimal(0);
  for (const log of input.timeLogs) {
    const rate = pickCostRate(input.costRates, log.gradeId, log.date);
    if (rate.currency !== input.reportingCurrency) {
      throw new Error(
        `PnL: cost rate currency ${rate.currency} != reporting ${input.reportingCurrency}`,
      );
    }
    const days = new Decimal(log.hours).div(hoursPerDay);
    effort = effort.plus(days.mul(rate.ratePerDay));
  }

  // Trip cost categories
  let travel = new Decimal(0);
  let lodging = new Decimal(0);
  let da = new Decimal(0);
  let localConveyance = new Decimal(0);
  for (const t of input.tripCosts) {
    assertCurrency(t.currency, input.reportingCurrency, 'trip');
    travel = travel.plus(t.travel);
    lodging = lodging.plus(t.lodging);
    da = da.plus(t.da);
    localConveyance = localConveyance.plus(t.localConveyance);
  }

  let otherExpenses = new Decimal(0);
  for (const e of input.otherExpenses) {
    assertCurrency(e.currency, input.reportingCurrency, 'expense');
    otherExpenses = otherExpenses.plus(e.amount);
  }

  let otherDirect = new Decimal(0);
  for (const e of input.otherDirectCosts) {
    assertCurrency(e.currency, input.reportingCurrency, 'direct cost');
    otherDirect = otherDirect.plus(e.amount);
  }

  const totalCost = effort
    .plus(travel)
    .plus(lodging)
    .plus(da)
    .plus(localConveyance)
    .plus(otherExpenses)
    .plus(otherDirect);

  const grossProfit = revenue.minus(totalCost);
  const marginPercent = revenue.isZero()
    ? null
    : Number(grossProfit.div(revenue).mul(100).toFixed(2));

  return {
    revenue: { amount: revenue.toFixed(2), currency: input.reportingCurrency },
    cost: { amount: totalCost.toFixed(2), currency: input.reportingCurrency },
    costBreakdown: {
      effort: effort.toFixed(2),
      travel: travel.toFixed(2),
      lodging: lodging.toFixed(2),
      da: da.toFixed(2),
      localConveyance: localConveyance.toFixed(2),
      otherExpenses: otherExpenses.toFixed(2),
      otherDirect: otherDirect.toFixed(2),
      total: totalCost.toFixed(2),
    },
    grossProfit: { amount: grossProfit.toFixed(2), currency: input.reportingCurrency },
    marginPercent,
  };
}

function pickCostRate(
  rates: readonly EffectiveCostRate[],
  gradeId: Id,
  onDate: IsoDate,
): EffectiveCostRate {
  const candidates = rates.filter((r) => r.gradeId === gradeId && r.effectiveFrom <= onDate);
  if (candidates.length === 0) {
    throw new Error(`PnL: no cost rate effective for grade ${gradeId} on ${onDate}`);
  }
  return candidates.reduce((a, b) => (a.effectiveFrom > b.effectiveFrom ? a : b));
}

function assertCurrency(actual: string, expected: string, what: string): void {
  if (actual !== expected) {
    throw new Error(`PnL: ${what} currency ${actual} != reporting ${expected}`);
  }
}
