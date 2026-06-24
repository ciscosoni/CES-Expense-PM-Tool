import { describe, it, expect } from 'vitest';
import {
  forecastMargin,
  predictUtilizationConflicts,
  recommendStaffing,
  detectExpenseSpike,
  wellbeingSignal,
  benchmarkEstimate,
  type EngineerCapacity,
  type AllocationLine,
  type CompletedProjectActuals,
} from './models.js';

describe('forecastMargin', () => {
  it('projects erosion when burn outpaces schedule', () => {
    // 50% through, already spent 700 of 1000 revenue → projected cost 1400 → negative margin.
    const f = forecastMargin({
      revenue: 1000,
      costToDate: 700,
      plannedStart: '2026-01-01',
      plannedEnd: '2026-03-01',
      asOf: '2026-01-30', // ~48% elapsed
    });
    expect(f.currentMarginPercent).toBeGreaterThan(0); // 30% now
    expect(f.projectedMarginPercent).toBeLessThan(0); // heading underwater
    expect(f.trajectory).toBe('ERODING');
    expect(f.riskBand).toBe('CRITICAL');
    expect(f.reasons.length).toBeGreaterThan(0);
  });

  it('projects a healthy margin when burn is on track', () => {
    // 50% through, spent 350 of 1000 → projected 700 → 30% margin.
    const f = forecastMargin({
      revenue: 1000,
      costToDate: 350,
      plannedStart: '2026-01-01',
      plannedEnd: '2026-03-01',
      asOf: '2026-01-30',
    });
    expect(f.projectedMarginPercent).toBeGreaterThanOrEqual(25);
    expect(['LOW', 'MEDIUM']).toContain(f.riskBand);
  });

  it('does not extrapolate before 10% elapsed', () => {
    const f = forecastMargin({
      revenue: 1000,
      costToDate: 50,
      plannedStart: '2026-01-01',
      plannedEnd: '2026-12-31',
      asOf: '2026-01-05', // ~1% elapsed
    });
    expect(f.projectedFinalCost).toBe(50); // projection == current cost
    expect(f.reasons[0]).toMatch(/too early/i);
  });

  it('returns null margin when revenue is zero', () => {
    const f = forecastMargin({
      revenue: 0,
      costToDate: 100,
      plannedStart: '2026-01-01',
      plannedEnd: '2026-02-01',
      asOf: '2026-01-15',
    });
    expect(f.currentMarginPercent).toBeNull();
    expect(f.projectedMarginPercent).toBeNull();
  });
});

describe('predictUtilizationConflicts', () => {
  const window = { start: '2026-07-01', end: '2026-07-31' };
  it('flags an engineer overbooked across overlapping allocations', () => {
    const risks = predictUtilizationConflicts(
      [
        { userId: 'u1', userName: 'Rohit', percent: 60, periodStart: '2026-07-01', periodEnd: '2026-07-31' },
        { userId: 'u1', userName: 'Rohit', percent: 60, periodStart: '2026-07-15', periodEnd: '2026-08-15' },
        { userId: 'u2', userName: 'Priya', percent: 50, periodStart: '2026-07-01', periodEnd: '2026-07-31' },
      ],
      window,
    );
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({ userId: 'u1', totalPercent: 120, overbookedByPercent: 20 });
  });

  it('ignores allocations outside the window', () => {
    const risks = predictUtilizationConflicts(
      [{ userId: 'u1', userName: 'Rohit', percent: 150, periodStart: '2026-09-01', periodEnd: '2026-09-30' }],
      window,
    );
    expect(risks).toHaveLength(0);
  });
});

describe('detectExpenseSpike', () => {
  it('flags a clear spike above mean + 2σ', () => {
    const r = detectExpenseSpike([
      { period: '2026-01', amount: 100 },
      { period: '2026-02', amount: 110 },
      { period: '2026-03', amount: 95 },
      { period: '2026-04', amount: 500 },
    ]);
    expect(r.isSpike).toBe(true);
    expect(r.zScore).not.toBeNull();
    expect(r.latest).toBe(500);
  });

  it('does not flag a normal latest period', () => {
    const r = detectExpenseSpike([
      { period: '2026-01', amount: 100 },
      { period: '2026-02', amount: 110 },
      { period: '2026-03', amount: 95 },
      { period: '2026-04', amount: 105 },
    ]);
    expect(r.isSpike).toBe(false);
  });

  it('needs at least 3 periods', () => {
    const r = detectExpenseSpike([
      { period: '2026-01', amount: 100 },
      { period: '2026-02', amount: 999 },
    ]);
    expect(r.isSpike).toBe(false);
    expect(r.reason).toMatch(/not enough history/i);
  });
});

describe('wellbeingSignal', () => {
  it('flags HIGH risk on 3 consecutive high weeks', () => {
    const s = wellbeingSignal({ userId: 'u1', userName: 'Rohit', weeklyOnSiteHours: [40, 58, 60, 62] });
    expect(s.consecutiveHighWeeks).toBe(3);
    expect(s.riskLevel).toBe('HIGH');
  });

  it('reports LOW risk for a healthy load', () => {
    const s = wellbeingSignal({ userId: 'u2', userName: 'Priya', weeklyOnSiteHours: [38, 40, 42, 39] });
    expect(s.riskLevel).toBe('LOW');
    expect(s.reasons[0]).toMatch(/healthy/i);
  });

  it('handles no data without throwing', () => {
    const s = wellbeingSignal({ userId: 'u3', userName: 'New', weeklyOnSiteHours: [] });
    expect(s.avgWeeklyHours).toBe(0);
    expect(s.riskLevel).toBe('LOW');
  });
});

describe('recommendStaffing', () => {
  const window = { start: '2026-07-01', end: '2026-07-31' };
  const jul = { periodStart: '2026-07-01', periodEnd: '2026-07-31' };

  const eng = (id: string, name: string, rank: number, cost: number, ccy = 'INR'): EngineerCapacity => ({
    userId: id,
    userName: name,
    gradeCode: `L${rank}`,
    gradeRank: rank,
    costPerDay: cost,
    currency: ccy,
  });
  const alloc = (id: string, userId: string, code: string, percent: number): AllocationLine => ({
    id,
    userId,
    projectId: `p-${code}`,
    projectCode: code,
    percent,
    ...jul,
  });

  it('classifies capacity: overbooked, available, bench', () => {
    const plan = recommendStaffing({
      engineers: [eng('u1', 'Rohit', 3, 5000), eng('u2', 'Priya', 3, 5000), eng('u3', 'Sam', 3, 5000)],
      allocations: [
        alloc('a1', 'u1', 'ACI', 70),
        alloc('a2', 'u1', 'SDWAN', 60), // u1 = 130% overbooked
        alloc('a3', 'u2', 'SEC', 50), // u2 = 50% available
        // u3 unallocated = bench
      ],
      window,
    });
    const byId = Object.fromEntries(plan.capacity.map((c) => [c.userId, c]));
    expect(byId.u1!.status).toBe('OVERBOOKED');
    expect(byId.u1!.allocatedPercent).toBe(130);
    expect(byId.u2!.status).toBe('AVAILABLE');
    expect(byId.u3!.status).toBe('BENCH');
    // Overbooked sorts first.
    expect(plan.capacity[0]!.userId).toBe('u1');
  });

  it('recommends moving a chunk off an overbooked engineer to a grade-matched, cheaper peer', () => {
    const plan = recommendStaffing({
      engineers: [
        eng('u1', 'Rohit', 3, 6000), // overbooked, dearer
        eng('u2', 'Priya', 3, 4000), // exact grade, cheaper, free
      ],
      allocations: [alloc('a1', 'u1', 'ACI', 70), alloc('a2', 'u1', 'SDWAN', 60)],
      window,
    });
    expect(plan.moves).toHaveLength(1);
    const m = plan.moves[0]!;
    expect(m.fromUserId).toBe('u1');
    expect(m.toUserId).toBe('u2');
    expect(m.percent).toBe(70); // biggest chunk relieves 130→60 in one move
    expect(m.gradeMatch).toBe('EXACT');
    expect(m.costDeltaPerDay).toBe(-2000); // saves 2000/day
    expect(m.reasons.some((r) => /Saves 2000/.test(r))).toBe(true);
  });

  it('will not suggest across more than one seniority band', () => {
    const plan = recommendStaffing({
      engineers: [eng('u1', 'Senior', 4, 8000), eng('u2', 'Junior', 1, 2000)],
      allocations: [alloc('a1', 'u1', 'ACI', 70), alloc('a2', 'u1', 'SDWAN', 60)],
      window,
    });
    expect(plan.moves).toHaveLength(0);
    expect(plan.reasons.some((r) => /no grade-matched capacity|un-relievable/i.test(r))).toBe(true);
  });

  it('prefers an exact-grade match over a cheaper adjacent one', () => {
    const plan = recommendStaffing({
      engineers: [
        eng('u1', 'Rohit', 3, 5000),
        eng('u2', 'Exact', 3, 5000), // exact grade
        eng('u3', 'Cheaper', 2, 3000), // adjacent, cheaper
      ],
      allocations: [alloc('a1', 'u1', 'ACI', 70), alloc('a2', 'u1', 'SDWAN', 60)],
      window,
    });
    expect(plan.moves[0]!.toUserId).toBe('u2');
    expect(plan.moves[0]!.gradeMatch).toBe('EXACT');
  });

  it('ignores allocations outside the window and is deterministic', () => {
    const plan = recommendStaffing({
      engineers: [eng('u1', 'Rohit', 3, 5000), eng('u2', 'Priya', 3, 5000)],
      allocations: [
        alloc('a1', 'u1', 'ACI', 70),
        { ...alloc('a2', 'u1', 'OLD', 60), periodStart: '2026-01-01', periodEnd: '2026-01-31' },
      ],
      window,
    });
    // Only 70% in-window → not overbooked → no moves.
    expect(plan.moves).toHaveLength(0);
    expect(plan.capacity.find((c) => c.userId === 'u1')!.allocatedPercent).toBe(70);
  });

  it('does not show a cost delta across currencies', () => {
    const plan = recommendStaffing({
      engineers: [eng('u1', 'Rohit', 3, 6000, 'INR'), eng('u2', 'Dubai', 3, 200, 'AED')],
      allocations: [alloc('a1', 'u1', 'ACI', 70), alloc('a2', 'u1', 'SDWAN', 60)],
      window,
    });
    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0]!.costDeltaPerDay).toBeNull();
    expect(plan.moves[0]!.reasons.some((r) => /AED|INR/.test(r))).toBe(true);
  });
});

describe('benchmarkEstimate', () => {
  const proj = (
    code: string,
    revenue: number,
    marginPercent: number | null,
    cost: Partial<CompletedProjectActuals['costByCategory']>,
  ): CompletedProjectActuals => ({
    projectId: code,
    code,
    revenue,
    marginPercent,
    costByCategory: {
      effort: 0,
      travel: 0,
      lodging: 0,
      da: 0,
      localConveyance: 0,
      otherExpenses: 0,
      otherDirect: 0,
      ...cost,
    },
  });

  it('returns an empty benchmark with guidance when there is no history', () => {
    const b = benchmarkEstimate({ category: 'ACI', comparables: [] });
    expect(b.sampleSize).toBe(0);
    expect(b.avgMarginPercent).toBeNull();
    expect(b.costMixPercentOfRevenue).toBeNull();
    expect(b.reasons[0]).toMatch(/no closed aci projects/i);
  });

  it('averages realized margin and cost mix as % of revenue', () => {
    const b = benchmarkEstimate({
      category: 'ACI',
      comparables: [
        proj('A', 1000, 20, { effort: 600, travel: 100 }),
        proj('B', 1000, 30, { effort: 500, travel: 60 }),
      ],
    });
    expect(b.sampleSize).toBe(2);
    expect(b.avgMarginPercent).toBe(25);
    expect(b.marginRange).toEqual({ min: 20, max: 30 });
    // travel: (100/1000 + 60/1000)/2 *100 = 8%
    expect(b.costMixPercentOfRevenue!.travel).toBe(8);
    expect(b.costMixPercentOfRevenue!.effort).toBe(55);
  });

  it('flags an optimistic plan margin against history', () => {
    const b = benchmarkEstimate({
      category: 'ACI',
      candidateMarginPercent: 40,
      comparables: [proj('A', 1000, 20, {}), proj('B', 1000, 22, {})],
    });
    expect(b.marginVerdict!.signal).toBe('OPTIMISTIC');
    expect(b.marginVerdict!.deltaPoints).toBeGreaterThan(0);
  });

  it('calls a plan in line with history INLINE', () => {
    const b = benchmarkEstimate({
      category: 'ACI',
      candidateMarginPercent: 23,
      comparables: [proj('A', 1000, 20, {}), proj('B', 1000, 24, {})],
    });
    expect(b.marginVerdict!.signal).toBe('INLINE');
  });

  it('ignores projects with zero revenue in the cost mix', () => {
    const b = benchmarkEstimate({
      category: 'ACI',
      comparables: [proj('A', 1000, 20, { travel: 100 }), proj('Z', 0, null, { travel: 50 })],
    });
    expect(b.costMixPercentOfRevenue!.travel).toBe(10); // only project A counts
  });
});
