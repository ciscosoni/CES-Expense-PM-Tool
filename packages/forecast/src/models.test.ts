import { describe, it, expect } from 'vitest';
import {
  forecastMargin,
  predictUtilizationConflicts,
  detectExpenseSpike,
  wellbeingSignal,
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
