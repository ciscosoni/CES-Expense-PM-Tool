import { z } from 'zod';
import { parseEnv } from '@ces/config';

export const ApiEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  AZURE_TENANT_ID: z.string().min(1),
  AZURE_API_CLIENT_ID: z.string().min(1),
  AZURE_API_AUDIENCE: z.string().min(1),
});

export type ApiEnv = z.infer<typeof ApiEnv>;

export function loadApiEnv(): ApiEnv {
  return parseEnv(ApiEnv);
}
