import { describe, it, expect } from 'vitest';
import { scoreBillableJustification } from './billable.js';

describe('scoreBillableJustification', () => {
  it('flags MISSING when there is no note', () => {
    const r = scoreBillableJustification({ hours: 4, notes: null });
    expect(r.band).toBe('MISSING');
    expect(r.reasons).toContain('NO_JUSTIFICATION');
  });

  it('flags MISSING for whitespace-only notes', () => {
    expect(scoreBillableJustification({ hours: 2, notes: '   ' }).band).toBe('MISSING');
  });

  it('flags generic filler as WEAK', () => {
    const r = scoreBillableJustification({ hours: 3, notes: 'WIP' });
    expect(r.band).toBe('WEAK');
    expect(r.reasons).toEqual(expect.arrayContaining(['GENERIC', 'TERSE']));
  });

  it('flags a note that just echoes the task name', () => {
    const r = scoreBillableJustification({
      hours: 6,
      notes: 'ACI fabric migration',
      taskName: 'ACI fabric migration',
    });
    expect(r.band).toBe('WEAK');
    expect(r.reasons).toContain('ECHOES_TASK');
  });

  it('flags a full day billed against a one-liner', () => {
    const r = scoreBillableJustification({ hours: 8, notes: 'config work' });
    expect(r.band).toBe('WEAK');
    expect(r.reasons).toContain('HIGH_HOURS_THIN_NOTE');
  });

  it('passes a specific, substantial justification as SOLID', () => {
    const r = scoreBillableJustification({
      hours: 8,
      notes: 'Configured 2 spine + 6 leaf ACI fabric, stitched VRFs to the Hyderabad DR site, validated 12 tenants.',
      taskName: 'ACI fabric build',
    });
    expect(r.band).toBe('SOLID');
    expect(r.reasons).toHaveLength(0);
  });

  it('is deterministic', () => {
    const input = { hours: 5, notes: 'reviewed configs', taskName: 'Review' };
    expect(scoreBillableJustification(input)).toEqual(scoreBillableJustification(input));
  });
});
