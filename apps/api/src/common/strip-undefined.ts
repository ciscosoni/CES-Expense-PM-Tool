type StripUndefined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/**
 * Returns a shallow copy of `obj` without keys whose value is `undefined`.
 * Bridges our `exactOptionalPropertyTypes` DTOs to Prisma's input types,
 * which don't accept `undefined` for non-optional fields even at runtime.
 *
 * Return type strips `undefined` out of each value's union, so the result is
 * directly assignable to Prisma `*UpdateInput` types under exactOptionalPropertyTypes.
 */
export function stripUndefined<T extends object>(obj: T): StripUndefined<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as StripUndefined<T>;
}
