/**
 * Returns a shallow copy of `obj` without keys whose value is `undefined`.
 * Bridges our exactOptionalPropertyTypes DTOs to Prisma's input types,
 * which don't accept `undefined` for non-optional fields even at runtime.
 */
export function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out = {} as Partial<T>;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
