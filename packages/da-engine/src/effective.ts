/**
 * Returns the row with the latest `effectiveFrom` that is <= `onDate`.
 * Returns undefined if no row is yet effective. Caller decides how to handle.
 *
 * IsoDate strings (YYYY-MM-DD) are lexicographically comparable, so no Date parsing needed.
 */
export function resolveEffective<T extends { effectiveFrom: string }>(
  rows: readonly T[],
  onDate: string,
): T | undefined {
  let chosen: T | undefined;
  for (const row of rows) {
    if (row.effectiveFrom > onDate) continue;
    if (!chosen || row.effectiveFrom > chosen.effectiveFrom) {
      chosen = row;
    }
  }
  return chosen;
}
