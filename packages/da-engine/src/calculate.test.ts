import { describe, it, expect } from 'vitest';
import { calculateDa } from './calculate.js';
import type { DaPolicy, EntitlementMatrixRow } from '@ces/domain';

const grade = 'a0000000-0000-0000-0000-000000000001';

function ent(overrides: Partial<EntitlementMatrixRow> = {}): EntitlementMatrixRow {
  return {
    id: 'e1',
    gradeId: grade,
    cityTier: 'METRO',
    perDiemAmount: '1500.00',
    perDiemCurrency: 'INR',
    lodgingCapPerNight: '5000.00',
    lodgingCurrency: 'INR',
    travelClass: 'FLIGHT_ECONOMY',
    localConveyanceCapPerDay: '500.00',
    localConveyanceCurrency: 'INR',
    effectiveFrom: '2024-01-01',
    ...overrides,
  };
}

function policy(overrides: Partial<DaPolicy> = {}): DaPolicy {
  return {
    id: 'p1',
    name: 'standard',
    partialDayPercent: 0.5,
    intraCitySameDayPaysDa: false,
    effectiveFrom: '2024-01-01',
    ...overrides,
  };
}

describe('calculateDa', () => {
  it('single-day inter-city trip pays one full day', () => {
    const res = calculateDa({
      gradeId: grade,
      cityTier: 'METRO',
      startDate: '2025-03-10',
      endDate: '2025-03-10',
      tripType: 'INTER_CITY',
      entitlements: [ent()],
      policies: [policy()],
    });
    expect(res.eligibleDays).toBe(1);
    expect(res.total).toEqual({ amount: '1500.00', currency: 'INR' });
    expect(res.breakdown).toHaveLength(1);
    expect(res.breakdown[0]?.reason).toBe('FULL_DAY');
  });

  it('intra-city same-day pays zero by default', () => {
    const res = calculateDa({
      gradeId: grade,
      cityTier: 'METRO',
      startDate: '2025-03-10',
      endDate: '2025-03-10',
      tripType: 'INTRA_CITY',
      entitlements: [ent()],
      policies: [policy()],
    });
    expect(res.eligibleDays).toBe(0);
    expect(res.total.amount).toBe('0.00');
    expect(res.breakdown[0]?.reason).toBe('INTRA_CITY_NO_OVERNIGHT');
  });

  it('intra-city same-day pays full day when policy allows', () => {
    const res = calculateDa({
      gradeId: grade,
      cityTier: 'METRO',
      startDate: '2025-03-10',
      endDate: '2025-03-10',
      tripType: 'INTRA_CITY',
      entitlements: [ent()],
      policies: [policy({ intraCitySameDayPaysDa: true })],
    });
    expect(res.eligibleDays).toBe(1);
    expect(res.total.amount).toBe('1500.00');
  });

  it('3-day trip prorates departure and return days at 50%', () => {
    const res = calculateDa({
      gradeId: grade,
      cityTier: 'METRO',
      startDate: '2025-03-10', // departure (50%)
      endDate: '2025-03-12', // return (50%)
      tripType: 'INTER_CITY',
      entitlements: [ent()],
      policies: [policy()],
    });
    // 0.5 + 1 + 0.5 = 2 days × 1500 = 3000
    expect(res.eligibleDays).toBe(2);
    expect(res.total.amount).toBe('3000.00');
    expect(res.breakdown.map((b) => b.reason)).toEqual(['DEPARTURE_DAY', 'FULL_DAY', 'RETURN_DAY']);
  });

  it('uses the matrix row effective on each date (mid-trip rate change)', () => {
    // Per-diem changes from 1500 → 2000 on day 2 of a 3-day trip.
    const oldRate = ent({ id: 'old', perDiemAmount: '1500.00', effectiveFrom: '2024-01-01' });
    const newRate = ent({ id: 'new', perDiemAmount: '2000.00', effectiveFrom: '2025-03-11' });

    const res = calculateDa({
      gradeId: grade,
      cityTier: 'METRO',
      startDate: '2025-03-10',
      endDate: '2025-03-12',
      tripType: 'INTER_CITY',
      entitlements: [oldRate, newRate],
      policies: [policy()],
    });
    // Day1 = 1500 × 0.5 = 750, Day2 = 2000 × 1 = 2000, Day3 = 2000 × 0.5 = 1000  => 3750
    expect(res.total.amount).toBe('3750.00');
  });

  it('honors a policy change mid-trip (proration % flips)', () => {
    // Day 1 under 50% proration, Day 3 under 25% proration.
    const policies = [
      policy({ id: 'p1', partialDayPercent: 0.5, effectiveFrom: '2024-01-01' }),
      policy({ id: 'p2', partialDayPercent: 0.25, effectiveFrom: '2025-03-12' }),
    ];
    const res = calculateDa({
      gradeId: grade,
      cityTier: 'METRO',
      startDate: '2025-03-10',
      endDate: '2025-03-12',
      tripType: 'INTER_CITY',
      entitlements: [ent()],
      policies,
    });
    // Day1 (depart, p1=0.5) = 750, Day2 (full, p2 but full-day) = 1500, Day3 (return, p2=0.25) = 375
    expect(res.total.amount).toBe('2625.00');
  });

  it('throws when no entitlement exists for the grade × tier on a date', () => {
    expect(() =>
      calculateDa({
        gradeId: grade,
        cityTier: 'METRO',
        startDate: '2023-01-01',
        endDate: '2023-01-01',
        tripType: 'INTER_CITY',
        entitlements: [ent({ effectiveFrom: '2024-01-01' })],
        policies: [policy()],
      }),
    ).toThrow(/no entitlement effective/);
  });

  it('throws on startDate > endDate', () => {
    expect(() =>
      calculateDa({
        gradeId: grade,
        cityTier: 'METRO',
        startDate: '2025-03-12',
        endDate: '2025-03-10',
        tripType: 'INTER_CITY',
        entitlements: [ent()],
        policies: [policy()],
      }),
    ).toThrow(/startDate .* is after endDate/);
  });

  it('throws if currency changes mid-trip (multi-currency unsupported)', () => {
    const inr = ent({ id: 'inr', perDiemCurrency: 'INR', effectiveFrom: '2024-01-01' });
    const usd = ent({
      id: 'usd',
      perDiemAmount: '50.00',
      perDiemCurrency: 'USD',
      effectiveFrom: '2025-03-11',
    });
    expect(() =>
      calculateDa({
        gradeId: grade,
        cityTier: 'METRO',
        startDate: '2025-03-10',
        endDate: '2025-03-12',
        tripType: 'INTER_CITY',
        entitlements: [inr, usd],
        policies: [policy()],
      }),
    ).toThrow(/currency mismatch/);
  });
});
