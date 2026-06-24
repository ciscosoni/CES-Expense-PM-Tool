/**
 * Pure justification-quality scorer for billable time (P10 #3).
 *
 * `TimeLog.billable = true` time becomes T&M revenue on the client invoice. If a
 * billable log carries a thin or empty justification, that revenue is the first
 * thing a client disputes — and "is what they're doing actually billable?" is a
 * named founder pain point. This scorer flags weak justifications deterministically
 * (no I/O, no LLM) so they surface to the PM *before* the invoice is cut.
 *
 * It judges the NOTE only — it never decides billability itself (that stays a
 * human/derived decision; the optional AI layer is suggest-only). Reason codes
 * ship with every result so the flag is explainable (principle #10).
 */

export type BillableBand = 'SOLID' | 'WEAK' | 'MISSING';

export interface BillableJustificationInput {
  hours: number;
  notes: string | null;
  /** Task name, to catch notes that merely echo it. */
  taskName?: string | null;
}

export interface BillableJustificationResult {
  band: BillableBand;
  /** Machine-readable signals. */
  reasons: string[];
  /** One-line human explanation of the band. */
  summary: string;
}

/** Low-content fillers that don't defend a billed hour. */
const GENERIC_PHRASES = new Set([
  'wip',
  'work in progress',
  'worked on it',
  'working on it',
  'ongoing',
  'misc',
  'miscellaneous',
  'task',
  'tasks',
  'as discussed',
  'as per plan',
  'same as yesterday',
  'continued',
  'continuation',
  'general work',
  'work',
  'done',
  'na',
  'n/a',
]);

const MIN_MEANINGFUL_CHARS = 15;
const HIGH_HOURS = 8;
const HIGH_HOURS_MIN_CHARS = 25;

export function scoreBillableJustification(
  input: BillableJustificationInput,
): BillableJustificationResult {
  const notes = (input.notes ?? '').trim();

  if (!notes) {
    return {
      band: 'MISSING',
      reasons: ['NO_JUSTIFICATION'],
      summary: 'No justification recorded — nothing defends this on the invoice.',
    };
  }

  const lower = notes.toLowerCase();
  const alnum = notes.replace(/[^a-z0-9]/gi, '');
  const reasons: string[] = [];

  if (GENERIC_PHRASES.has(lower) || alnum.length < 3) reasons.push('GENERIC');
  if (notes.length < MIN_MEANINGFUL_CHARS) reasons.push('TERSE');
  if (input.taskName && lower === input.taskName.trim().toLowerCase()) reasons.push('ECHOES_TASK');
  if (input.hours >= HIGH_HOURS && notes.length < HIGH_HOURS_MIN_CHARS) {
    reasons.push('HIGH_HOURS_THIN_NOTE');
  }

  if (reasons.length === 0) {
    return { band: 'SOLID', reasons: [], summary: 'Specific justification on record.' };
  }
  return { band: 'WEAK', reasons, summary: weakSummary(reasons, input.hours) };
}

const REASON_TEXT: Record<string, string> = {
  GENERIC: 'filler text, not a specific activity',
  TERSE: 'too short to defend the hours billed',
  ECHOES_TASK: 'just repeats the task name',
  HIGH_HOURS_THIN_NOTE: 'a full day billed against a one-liner',
};

function weakSummary(reasons: string[], hours: number): string {
  const parts = reasons.map((r) => REASON_TEXT[r] ?? r);
  return `${hours}h billed but the note is ${parts.join(' and ')}.`;
}
