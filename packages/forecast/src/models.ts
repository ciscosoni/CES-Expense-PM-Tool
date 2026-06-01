/**
 * Pure predictive models for P8 (Predictive Intelligence). No DB, no I/O, no
 * dates-from-now — every input is passed in so the models are deterministic and
 * unit-testable. Each result carries reason codes (principle #10: every derived
 * number ships with its derivation).
 *
 * These are deliberately simple, explainable models (linear burn extrapolation,
 * z-score spikes, sustained-load thresholds) — not opaque ML. They turn the
 * leadership view from "what is" into "where this is heading".
 */

export type RiskBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Trajectory = 'IMPROVING' | 'STABLE' | 'ERODING';

// ---------- 1. Margin-erosion forecast ----------

export interface MarginForecastInput {
  revenue: number;
  costToDate: number;
  /** ISO dates (YYYY-MM-DD). */
  plannedStart: string;
  plannedEnd: string;
  asOf: string;
}

export interface MarginForecast {
  currentMarginPercent: number | null;
  projectedMarginPercent: number | null;
  projectedFinalCost: number;
  elapsedFraction: number;
  trajectory: Trajectory;
  riskBand: RiskBand;
  reasons: string[];
}

/**
 * Project a project's end-of-engagement margin by linearly extrapolating the
 * cost burn against schedule elapsed. Too early (<10% elapsed) → projection
 * equals current, since extrapolation would be noise.
 */
export function forecastMargin(input: MarginForecastInput): MarginForecast {
  const start = Date.parse(input.plannedStart);
  const end = Date.parse(input.plannedEnd);
  const asOf = Date.parse(input.asOf);
  const span = end - start;
  const frac = clamp(span > 0 ? (asOf - start) / span : 0, 0, 1);

  const current = marginPct(input.revenue, input.costToDate);
  const reasons: string[] = [];

  let projectedFinalCost = input.costToDate;
  if (frac >= 0.1) {
    projectedFinalCost = input.costToDate / frac;
    reasons.push(
      `Projected final cost ${round(projectedFinalCost)} = cost-to-date ${round(input.costToDate)} ÷ ${pct(frac)} elapsed`,
    );
  } else {
    reasons.push(`Only ${pct(frac)} elapsed — too early to extrapolate; projection = current`);
  }

  const projected = marginPct(input.revenue, projectedFinalCost);
  const trajectory = trajectoryOf(current, projected);
  const riskBand = bandOf(projected);
  if (projected !== null) reasons.push(`Projected margin ${projected}% → ${riskBand} risk`);

  return {
    currentMarginPercent: current,
    projectedMarginPercent: projected,
    projectedFinalCost: round(projectedFinalCost),
    elapsedFraction: round2(frac),
    trajectory,
    riskBand,
    reasons,
  };
}

// ---------- 2. Utilization / allocation-conflict prediction ----------

export interface AllocationWindow {
  userId: string;
  userName: string;
  percent: number;
  /** ISO dates. */
  periodStart: string;
  periodEnd: string;
}

export interface UtilizationRisk {
  userId: string;
  userName: string;
  totalPercent: number;
  overbookedByPercent: number;
}

/**
 * Sum each engineer's allocations overlapping a future window and flag those
 * over 100% — surfacing next month's overbookings before they bite.
 */
export function predictUtilizationConflicts(
  allocations: readonly AllocationWindow[],
  window: { start: string; end: string },
): UtilizationRisk[] {
  const ws = Date.parse(window.start);
  const we = Date.parse(window.end);
  const byUser = new Map<string, { name: string; total: number }>();
  for (const a of allocations) {
    if (Date.parse(a.periodStart) <= we && Date.parse(a.periodEnd) >= ws) {
      const g = byUser.get(a.userId) ?? { name: a.userName, total: 0 };
      g.total += a.percent;
      byUser.set(a.userId, g);
    }
  }
  const out: UtilizationRisk[] = [];
  for (const [userId, g] of byUser) {
    if (g.total > 100) {
      out.push({ userId, userName: g.name, totalPercent: g.total, overbookedByPercent: g.total - 100 });
    }
  }
  return out.sort((a, b) => b.overbookedByPercent - a.overbookedByPercent);
}

// ---------- 3. Expense-spike prediction ----------

export interface SpikePoint {
  period: string;
  amount: number;
}

export interface SpikeResult {
  isSpike: boolean;
  latest: number;
  mean: number;
  stdDev: number;
  zScore: number | null;
  threshold: number;
  reason: string;
}

/**
 * Flag the latest period as a spike when it exceeds mean + k·σ of the prior
 * periods. `history` is oldest→newest; the last point is "current".
 */
export function detectExpenseSpike(history: readonly SpikePoint[], k = 2): SpikeResult {
  const latest = history.length ? history[history.length - 1]!.amount : 0;
  if (history.length < 3) {
    return {
      isSpike: false,
      latest,
      mean: 0,
      stdDev: 0,
      zScore: null,
      threshold: 0,
      reason: 'Not enough history (need ≥3 periods).',
    };
  }
  const baseline = history.slice(0, -1).map((p) => p.amount);
  const mean = avg(baseline);
  const sd = stdDev(baseline, mean);
  const threshold = mean + k * sd;
  const zScore = sd > 0 ? (latest - mean) / sd : null;
  const isSpike = sd > 0 ? latest > threshold : latest > mean * 1.5;
  return {
    isSpike,
    latest: round(latest),
    mean: round(mean),
    stdDev: round(sd),
    zScore: zScore === null ? null : round2(zScore),
    threshold: round(threshold),
    reason: isSpike
      ? `Latest ${round(latest)} exceeds mean ${round(mean)} + ${k}σ (${round(threshold)})`
      : `Latest ${round(latest)} within normal range (mean ${round(mean)})`,
  };
}

// ---------- 4. Employee wellbeing signal (framed for the employee's benefit) ----------

export interface WellbeingInput {
  userId: string;
  userName: string;
  /** On-site hours per recent week, oldest→newest. */
  weeklyOnSiteHours: readonly number[];
}

export interface WellbeingSignal {
  userId: string;
  userName: string;
  riskLevel: RiskBand;
  avgWeeklyHours: number;
  consecutiveHighWeeks: number;
  reasons: string[];
}

/** Healthy/elevated weekly on-site hour thresholds. */
export const WELLBEING_HEALTHY_WEEKLY = 45;
export const WELLBEING_HIGH_WEEKLY = 55;

/**
 * Detect overwork risk from sustained high on-site hours. Intended to protect
 * the employee (flag overload for redistribution), not to surveil.
 */
export function wellbeingSignal(input: WellbeingInput): WellbeingSignal {
  const weeks = input.weeklyOnSiteHours;
  const avgHours = weeks.length ? avg(weeks) : 0;
  let consecutiveHighWeeks = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i]! > WELLBEING_HIGH_WEEKLY) consecutiveHighWeeks++;
    else break;
  }

  const reasons: string[] = [];
  let riskLevel: RiskBand = 'LOW';
  if (consecutiveHighWeeks >= 3 || avgHours > WELLBEING_HIGH_WEEKLY) {
    riskLevel = 'HIGH';
    reasons.push(
      `${consecutiveHighWeeks} consecutive week(s) over ${WELLBEING_HIGH_WEEKLY}h or avg ${round(avgHours)}h/wk — consider redistributing load`,
    );
  } else if (consecutiveHighWeeks >= 2 || avgHours > WELLBEING_HEALTHY_WEEKLY) {
    riskLevel = 'MEDIUM';
    reasons.push(`Sustained load: avg ${round(avgHours)}h/wk`);
  } else {
    reasons.push(`Healthy load: avg ${round(avgHours)}h/wk`);
  }
  return { userId: input.userId, userName: input.userName, riskLevel, avgWeeklyHours: round(avgHours), consecutiveHighWeeks, reasons };
}

// ---------- helpers ----------

function marginPct(revenue: number, cost: number): number | null {
  if (revenue <= 0) return null;
  return round2(((revenue - cost) / revenue) * 100);
}

function bandOf(margin: number | null): RiskBand {
  if (margin === null) return 'MEDIUM';
  if (margin < 0) return 'CRITICAL';
  if (margin < 15) return 'HIGH';
  if (margin < 30) return 'MEDIUM';
  return 'LOW';
}

function trajectoryOf(current: number | null, projected: number | null): Trajectory {
  if (current === null || projected === null) return 'STABLE';
  if (projected < current - 2) return 'ERODING';
  if (projected > current + 2) return 'IMPROVING';
  return 'STABLE';
}

function avg(xs: readonly number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function stdDev(xs: readonly number[], mean: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function round(x: number): number {
  return Math.round(x);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function pct(frac: number): string {
  return `${Math.round(frac * 100)}%`;
}
