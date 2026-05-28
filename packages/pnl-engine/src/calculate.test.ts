import { describe, it, expect } from 'vitest';
import { calculatePnl, type EffectiveCostRate } from './calculate.js';
import type { Milestone } from '@ces/domain';

const grade = 'g1';

const baseRate: EffectiveCostRate = {
  gradeId: grade,
  ratePerDay: '8000.00',
  currency: 'INR',
  effectiveFrom: '2024-01-01',
};

describe('calculatePnl', () => {
  it('fixed-price revenue minus effort + trip + expenses', () => {
    const res = calculatePnl({
      reportingCurrency: 'INR',
      billingModel: 'FIXED_PRICE',
      contractValue: '500000.00',
      timeLogs: [
        { gradeId: grade, date: '2025-03-10', hours: 8 }, // 1 day = 8000
        { gradeId: grade, date: '2025-03-11', hours: 4 }, // 0.5 day = 4000
      ],
      costRates: [baseRate],
      tripCosts: [
        {
          travel: '12000.00',
          lodging: '6000.00',
          da: '3000.00',
          localConveyance: '500.00',
          currency: 'INR',
        },
      ],
      otherExpenses: [{ amount: '750.00', currency: 'INR' }],
      otherDirectCosts: [],
    });

    expect(res.revenue.amount).toBe('500000.00');
    expect(res.costBreakdown.effort).toBe('12000.00');
    expect(res.costBreakdown.travel).toBe('12000.00');
    expect(res.costBreakdown.lodging).toBe('6000.00');
    expect(res.costBreakdown.da).toBe('3000.00');
    expect(res.costBreakdown.localConveyance).toBe('500.00');
    expect(res.costBreakdown.otherExpenses).toBe('750.00');
    expect(res.cost.amount).toBe('34250.00');
    expect(res.grossProfit.amount).toBe('465750.00');
    expect(res.marginPercent).toBeCloseTo(93.15, 2);
  });

  it('milestone revenue counts only signed-off milestones', () => {
    const milestones: Milestone[] = [
      {
        id: 'm1',
        projectId: 'p',
        name: 'Design',
        value: '100000.00',
        currency: 'INR',
        plannedDate: '2025-02-01',
        signedOffDate: '2025-02-15',
      },
      {
        id: 'm2',
        projectId: 'p',
        name: 'Implementation',
        value: '300000.00',
        currency: 'INR',
        plannedDate: '2025-04-01',
        signedOffDate: null, // not yet signed
      },
    ];
    const res = calculatePnl({
      reportingCurrency: 'INR',
      billingModel: 'MILESTONE',
      contractValue: '400000.00',
      milestones,
      timeLogs: [],
      costRates: [baseRate],
      tripCosts: [],
      otherExpenses: [],
      otherDirectCosts: [],
    });
    expect(res.revenue.amount).toBe('100000.00');
  });

  it('T&M billing uses caller-provided billing total', () => {
    const res = calculatePnl({
      reportingCurrency: 'INR',
      billingModel: 'T_AND_M',
      contractValue: '0.00',
      tmBillingTotal: '250000.00',
      timeLogs: [],
      costRates: [baseRate],
      tripCosts: [],
      otherExpenses: [],
      otherDirectCosts: [],
    });
    expect(res.revenue.amount).toBe('250000.00');
  });

  it('uses cost rate effective on the log date (mid-project rate change)', () => {
    const rateA: EffectiveCostRate = {
      ...baseRate,
      ratePerDay: '8000.00',
      effectiveFrom: '2024-01-01',
    };
    const rateB: EffectiveCostRate = {
      ...baseRate,
      ratePerDay: '10000.00',
      effectiveFrom: '2025-04-01',
    };

    const res = calculatePnl({
      reportingCurrency: 'INR',
      billingModel: 'FIXED_PRICE',
      contractValue: '0.00',
      timeLogs: [
        { gradeId: grade, date: '2025-03-31', hours: 8 }, // 8000 @ rateA
        { gradeId: grade, date: '2025-04-01', hours: 8 }, // 10000 @ rateB
      ],
      costRates: [rateA, rateB],
      tripCosts: [],
      otherExpenses: [],
      otherDirectCosts: [],
    });
    expect(res.costBreakdown.effort).toBe('18000.00');
  });

  it('marginPercent is null when revenue is zero', () => {
    const res = calculatePnl({
      reportingCurrency: 'INR',
      billingModel: 'FIXED_PRICE',
      contractValue: '0.00',
      timeLogs: [],
      costRates: [baseRate],
      tripCosts: [
        { travel: '100.00', lodging: '0', da: '0', localConveyance: '0', currency: 'INR' },
      ],
      otherExpenses: [],
      otherDirectCosts: [],
    });
    expect(res.revenue.amount).toBe('0.00');
    expect(res.marginPercent).toBeNull();
    expect(res.grossProfit.amount).toBe('-100.00');
  });

  it('throws on currency mismatch', () => {
    expect(() =>
      calculatePnl({
        reportingCurrency: 'INR',
        billingModel: 'FIXED_PRICE',
        contractValue: '0.00',
        timeLogs: [],
        costRates: [baseRate],
        tripCosts: [{ travel: '50', lodging: '0', da: '0', localConveyance: '0', currency: 'USD' }],
        otherExpenses: [],
        otherDirectCosts: [],
      }),
    ).toThrow(/trip currency USD/);
  });

  it('throws when MILESTONE billing called without milestones', () => {
    expect(() =>
      calculatePnl({
        reportingCurrency: 'INR',
        billingModel: 'MILESTONE',
        contractValue: '0.00',
        timeLogs: [],
        costRates: [baseRate],
        tripCosts: [],
        otherExpenses: [],
        otherDirectCosts: [],
      }),
    ).toThrow(/MILESTONE billing requires/);
  });
});
