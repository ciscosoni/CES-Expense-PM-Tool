import type { z } from 'zod';

/**
 * Parses `process.env` (or any record) against a Zod schema, throwing a readable error
 * listing every missing/invalid key. Designed for app startup — fail fast, fail loud.
 */
export function parseEnv<S extends z.ZodObject<z.ZodRawShape>>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
