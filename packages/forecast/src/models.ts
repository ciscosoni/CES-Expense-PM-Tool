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

// ---------- 2b. Staffing optimizer (resource optimization) ----------

export type CapacityStatus = 'OVERBOOKED' | 'FULL' | 'AVAILABLE' | 'BENCH';
export type GradeMatch = 'EXACT' | 'ADJACENT';

export interface EngineerCapacity {
  userId: string;
  userName: string;
  gradeCode: string;
  /** Grade.seniorityOrder — lower is more junior. Drives grade-match quality. */
  gradeRank: number;
  /** Cost rate effective on the window — the P&L signal for a reassignment. */
  costPerDay: number;
  currency: string;
}

export interface AllocationLine {
  id: string;
  userId: string;
  projectId: string;
  projectCode: string;
  percent: number;
  /** ISO dates. */
  periodStart: string;
  periodEnd: string;
}

export interface StaffingInput {
  engineers: readonly EngineerCapacity[];
  allocations: readonly AllocationLine[];
  window: { start: string; end: string };
  /** Treated as 100% if omitted. */
  fullCapacityPercent?: number;
}

export interface CapacityRow {
  userId: string;
  userName: string;
  gradeCode: string;
  gradeRank: number;
  allocatedPercent: number;
  sparePercent: number;
  status: CapacityStatus;
}

export interface StaffingMove {
  allocationId: string;
  projectId: string;
  projectCode: string;
  percent: number;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  gradeMatch: GradeMatch;
  /** to.costPerDay − from.costPerDay; null when currencies differ (not comparable). */
  costDeltaPerDay: number | null;
  currency: string;
  reasons: string[];
}

export interface StaffingPlan {
  window: { start: string; end: string };
  /** Every engineer in the pool, overbooked first then most-free. Answers "who's free?". */
  capacity: CapacityRow[];
  /** Suggested whole-allocation reassignments. Advisory — a human confirms. */
  moves: StaffingMove[];
  reasons: string[];
}

/** Minimum spare to be worth surfacing as AVAILABLE (below this but >0 ⇒ FULL). */
export const AVAILABLE_SPARE_MIN = 15;
/** Max seniority-band distance we'll suggest across (skill/quality guard). */
const GRADE_ADJACENT_MAX = 1;

/**
 * Recommend reassignments that relieve overbooked engineers by shifting whole
 * allocations onto grade-matched engineers with spare capacity in the window.
 *
 * Deliberately simple and explainable (greedy, reason-coded) — not opaque
 * optimization. It only *suggests*; a PM confirms (the engine never assigns).
 * Whole allocations move (no splitting) in v1 — reassigning a project, not a
 * fraction of one. Each move carries a cost-rate delta so the P&L impact is
 * visible before anyone acts (principle #10).
 */
export function recommendStaffing(input: StaffingInput): StaffingPlan {
  const full = input.fullCapacityPercent ?? 100;
  const ws = Date.parse(input.window.start);
  const we = Date.parse(input.window.end);

  const inWindow = input.allocations.filter(
    (a) => Date.parse(a.periodStart) <= we && Date.parse(a.periodEnd) >= ws,
  );

  const allocByUser = new Map<string, AllocationLine[]>();
  const allocatedByUser = new Map<string, number>();
  for (const a of inWindow) {
    (allocByUser.get(a.userId) ?? allocByUser.set(a.userId, []).get(a.userId)!).push(a);
    allocatedByUser.set(a.userId, (allocatedByUser.get(a.userId) ?? 0) + a.percent);
  }

  // Capacity row per engineer in the pool (deterministic order by userId).
  const engineers = [...input.engineers].sort((a, b) => a.userId.localeCompare(b.userId));
  const capacity: CapacityRow[] = engineers.map((e) => {
    const allocated = allocatedByUser.get(e.userId) ?? 0;
    const spare = Math.max(0, full - allocated);
    return {
      userId: e.userId,
      userName: e.userName,
      gradeCode: e.gradeCode,
      gradeRank: e.gradeRank,
      allocatedPercent: allocated,
      sparePercent: spare,
      status: statusOf(allocated, full),
    };
  });
  const engById = new Map(engineers.map((e) => [e.userId, e]));

  // Mutable spare per candidate (anyone not overbooked, with room to take work).
  const spareById = new Map<string, number>();
  for (const row of capacity) {
    if (row.status !== 'OVERBOOKED' && row.sparePercent > 0) spareById.set(row.userId, row.sparePercent);
  }

  const moves: StaffingMove[] = [];
  let unrelieved = 0;
  // Largest overbooking first.
  const overbooked = capacity
    .filter((r) => r.status === 'OVERBOOKED')
    .sort((a, b) => b.allocatedPercent - a.allocatedPercent || a.userId.localeCompare(b.userId));

  for (const ob of overbooked) {
    const from = engById.get(ob.userId)!;
    let need = ob.allocatedPercent - full;
    // Move biggest chunks first to relieve with the fewest reassignments.
    const lines = (allocByUser.get(ob.userId) ?? [])
      .slice()
      .sort((a, b) => b.percent - a.percent || a.id.localeCompare(b.id));
    let relievedSomething = false;
    for (const line of lines) {
      if (need <= 0) break;
      const cand = pickCandidate(line.percent, from, engineers, spareById);
      if (!cand) continue;
      const to = cand.eng;
      const sameCcy = to.currency === from.currency;
      const costDelta = sameCcy ? round(to.costPerDay - from.costPerDay) : null;
      moves.push({
        allocationId: line.id,
        projectId: line.projectId,
        projectCode: line.projectCode,
        percent: line.percent,
        fromUserId: from.userId,
        fromUserName: from.userName,
        toUserId: to.userId,
        toUserName: to.userName,
        gradeMatch: cand.match,
        costDeltaPerDay: costDelta,
        currency: from.currency,
        reasons: moveReasons(from, to, line, ob, full, cand.match, costDelta, sameCcy),
      });
      spareById.set(to.userId, (spareById.get(to.userId) ?? 0) - line.percent);
      need -= line.percent;
      relievedSomething = true;
    }
    if (!relievedSomething) unrelieved++;
  }

  capacity.sort(byStatusThenFree);

  const benchCount = capacity.filter((r) => r.status === 'BENCH').length;
  const availCount = capacity.filter((r) => r.status === 'AVAILABLE').length;
  const reasons: string[] = [];
  reasons.push(
    moves.length
      ? `${moves.length} reassignment(s) would relieve ${overbooked.length - unrelieved} of ${overbooked.length} overbooked engineer(s)`
      : overbooked.length
        ? `${overbooked.length} engineer(s) overbooked — no grade-matched capacity to absorb`
        : 'No overbooked engineers in this window',
  );
  reasons.push(`${benchCount} on bench, ${availCount} with spare capacity (≥${AVAILABLE_SPARE_MIN}%)`);
  if (unrelieved > 0)
    reasons.push(`${unrelieved} overbooked engineer(s) un-relievable from the bench — consider a contractor/hire`);

  return { window: input.window, capacity, moves, reasons };
}

function statusOf(allocated: number, full: number): CapacityStatus {
  if (allocated === 0) return 'BENCH';
  if (allocated > full) return 'OVERBOOKED';
  if (full - allocated >= AVAILABLE_SPARE_MIN) return 'AVAILABLE';
  return 'FULL';
}

/**
 * Best engineer to absorb a `percent` allocation off `from`: grade-matched
 * (exact preferred, then ±1 band), enough spare, then cheapest (P&L), then most
 * spare. Returns null when nobody qualifies.
 */
function pickCandidate(
  percent: number,
  from: EngineerCapacity,
  engineers: readonly EngineerCapacity[],
  spareById: Map<string, number>,
): { eng: EngineerCapacity; match: GradeMatch } | null {
  let best: { eng: EngineerCapacity; match: GradeMatch } | null = null;
  for (const e of engineers) {
    if (e.userId === from.userId) continue;
    const spare = spareById.get(e.userId) ?? 0;
    if (spare < percent) continue;
    const diff = Math.abs(e.gradeRank - from.gradeRank);
    if (diff > GRADE_ADJACENT_MAX) continue;
    const match: GradeMatch = diff === 0 ? 'EXACT' : 'ADJACENT';
    if (best === null || isBetterCandidate(e, match, spare, best, spareById)) {
      best = { eng: e, match };
    }
  }
  return best;
}

function isBetterCandidate(
  e: EngineerCapacity,
  match: GradeMatch,
  spare: number,
  best: { eng: EngineerCapacity; match: GradeMatch },
  spareById: Map<string, number>,
): boolean {
  // Exact grade beats adjacent.
  if (match !== best.match) return match === 'EXACT';
  // Then cheaper cost rate (P&L-friendly).
  if (e.costPerDay !== best.eng.costPerDay) return e.costPerDay < best.eng.costPerDay;
  // Then more spare capacity.
  const bestSpare = spareById.get(best.eng.userId) ?? 0;
  if (spare !== bestSpare) return spare > bestSpare;
  // Deterministic final tie-break.
  return e.userId.localeCompare(best.eng.userId) < 0;
}

function moveReasons(
  from: EngineerCapacity,
  to: EngineerCapacity,
  line: AllocationLine,
  ob: CapacityRow,
  full: number,
  match: GradeMatch,
  costDelta: number | null,
  sameCcy: boolean,
): string[] {
  const r = [
    `${from.userName} overbooked at ${ob.allocatedPercent}% — moving ${line.percent}% (${line.projectCode}) eases toward ${full}%`,
    `${to.userName} has spare capacity and is a ${match === 'EXACT' ? 'same-grade' : 'one-band'} match (${from.gradeCode}→${to.gradeCode})`,
  ];
  if (!sameCcy) {
    r.push(`Cost delta not shown — ${to.userName} is paid in ${to.currency}, ${from.userName} in ${from.currency}`);
  } else if (costDelta === 0) {
    r.push(`Cost-neutral: same day rate (${from.costPerDay} ${from.currency})`);
  } else if (costDelta! < 0) {
    r.push(`Saves ${Math.abs(costDelta!)} ${from.currency}/day on this allocation`);
  } else {
    r.push(`Costs +${costDelta} ${from.currency}/day — heavier grade absorbing the work`);
  }
  return r;
}

const STATUS_SORT: Record<CapacityStatus, number> = { OVERBOOKED: 0, AVAILABLE: 1, BENCH: 2, FULL: 3 };
function byStatusThenFree(a: CapacityRow, b: CapacityRow): number {
  if (a.status !== b.status) return STATUS_SORT[a.status] - STATUS_SORT[b.status];
  if (a.status === 'OVERBOOKED') return b.allocatedPercent - a.allocatedPercent || a.userId.localeCompare(b.userId);
  return b.sparePercent - a.sparePercent || a.userId.localeCompare(b.userId);
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

// ---------- 5. Estimation memory (benchmark a new project against closed ones) ----------

export interface CostByCategory {
  effort: number;
  travel: number;
  lodging: number;
  da: number;
  localConveyance: number;
  otherExpenses: number;
  otherDirect: number;
}

export interface CompletedProjectActuals {
  projectId: string;
  code: string;
  revenue: number;
  marginPercent: number | null;
  /** Realized cost by category (absolute amounts in reporting currency). */
  costByCategory: CostByCategory;
}

export interface EstimateBenchmarkInput {
  category: string;
  /** The candidate plan's forecast margin %, to flag optimism. */
  candidateMarginPercent?: number | null;
  comparables: readonly CompletedProjectActuals[];
}

export type EstimateSignal = 'OPTIMISTIC' | 'CONSERVATIVE' | 'INLINE';

export interface EstimateBenchmark {
  category: string;
  sampleSize: number;
  avgMarginPercent: number | null;
  marginRange: { min: number; max: number } | null;
  /** Avg category spend as % of revenue across the comparables. */
  costMixPercentOfRevenue: CostByCategory | null;
  marginVerdict: {
    candidateMarginPercent: number;
    benchmarkMarginPercent: number;
    deltaPoints: number;
    signal: EstimateSignal;
    note: string;
  } | null;
  reasons: string[];
}

const COST_KEYS: (keyof CostByCategory)[] = [
  'effort',
  'travel',
  'lodging',
  'da',
  'localConveyance',
  'otherExpenses',
  'otherDirect',
];

/** Margin gap (points) beyond which a plan reads as optimistic/conservative vs history. */
export const ESTIMATE_MARGIN_TOLERANCE = 5;

/**
 * Turn the realized economics of closed similar projects into estimation memory:
 * the average margin actually achieved and where the money actually went (cost
 * mix as % of revenue) — so a new estimate is anchored in history, not hope.
 * Pure stats over actuals; no LLM, no I/O. When a candidate margin is supplied
 * it's flagged OPTIMISTIC/CONSERVATIVE/INLINE against the benchmark.
 */
export function benchmarkEstimate(input: EstimateBenchmarkInput): EstimateBenchmark {
  const comps = input.comparables;
  if (comps.length === 0) {
    return {
      category: input.category,
      sampleSize: 0,
      avgMarginPercent: null,
      marginRange: null,
      costMixPercentOfRevenue: null,
      marginVerdict: null,
      reasons: [`No closed ${input.category} projects to learn from yet — estimate from first principles.`],
    };
  }

  const margins = comps.map((c) => c.marginPercent).filter((m): m is number => m !== null);
  const avgMargin = margins.length ? round2(avg(margins)) : null;
  const marginRange = margins.length
    ? { min: round2(Math.min(...margins)), max: round2(Math.max(...margins)) }
    : null;

  // Cost mix: average each category's share of revenue across projects with revenue.
  const withRevenue = comps.filter((c) => c.revenue > 0);
  let costMix: CostByCategory | null = null;
  if (withRevenue.length) {
    const acc = blankCostMix();
    for (const c of withRevenue) {
      for (const k of COST_KEYS) acc[k] += (c.costByCategory[k] / c.revenue) * 100;
    }
    costMix = blankCostMix();
    for (const k of COST_KEYS) costMix[k] = round2(acc[k] / withRevenue.length);
  }

  const reasons: string[] = [
    `${comps.length} closed ${input.category} project(s) in memory${avgMargin !== null ? ` — realized margin averaged ${avgMargin}%` : ''}.`,
  ];

  let marginVerdict: EstimateBenchmark['marginVerdict'] = null;
  if (input.candidateMarginPercent != null && avgMargin !== null) {
    const delta = round2(input.candidateMarginPercent - avgMargin);
    const signal: EstimateSignal =
      delta > ESTIMATE_MARGIN_TOLERANCE
        ? 'OPTIMISTIC'
        : delta < -ESTIMATE_MARGIN_TOLERANCE
          ? 'CONSERVATIVE'
          : 'INLINE';
    const note =
      signal === 'OPTIMISTIC'
        ? `Plan forecasts ${input.candidateMarginPercent}% — ${delta} pts above what similar projects realized. Pressure-test the cost assumptions.`
        : signal === 'CONSERVATIVE'
          ? `Plan forecasts ${input.candidateMarginPercent}% — ${Math.abs(delta)} pts below history. Possibly padded, or a genuinely tougher job.`
          : `Plan forecasts ${input.candidateMarginPercent}% — in line with the ${avgMargin}% these projects realized.`;
    marginVerdict = {
      candidateMarginPercent: input.candidateMarginPercent,
      benchmarkMarginPercent: avgMargin,
      deltaPoints: delta,
      signal,
      note,
    };
    reasons.push(note);
  }

  if (costMix) {
    const top = COST_KEYS.map((k) => ({ k, v: costMix![k] }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 3)
      .map((x) => `${x.k} ${x.v}%`)
      .join(', ');
    reasons.push(`Where revenue went on average: ${top} (of revenue).`);
  }

  return {
    category: input.category,
    sampleSize: comps.length,
    avgMarginPercent: avgMargin,
    marginRange,
    costMixPercentOfRevenue: costMix,
    marginVerdict,
    reasons,
  };
}

function blankCostMix(): CostByCategory {
  return { effort: 0, travel: 0, lodging: 0, da: 0, localConveyance: 0, otherExpenses: 0, otherDirect: 0 };
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
