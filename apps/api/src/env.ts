import { z } from 'zod';
import { parseEnv } from '@ces/config';

export const ApiEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  AZURE_TENANT_ID: z.string().min(1),
  AZURE_API_CLIENT_ID: z.string().min(1),
  AZURE_API_AUDIENCE: z.string().min(1),
  // Client secret for the app registration — used by the Graph user-sync job
  // (client-credentials flow). Optional: when absent the sync uses a local mock.
  AZURE_API_CLIENT_SECRET: z.string().optional(),
  // Auth mode: 'dev' trusts the X-Dev-User-Email header (local); 'entra'
  // requires a valid Microsoft Entra ID JWT. When unset it is resolved at
  // runtime (prod + real tenant ⇒ entra, otherwise dev) so local dev needs
  // no extra env.
  AUTH_MODE: z.enum(['dev', 'entra']).optional(),
});

export type ApiEnv = z.infer<typeof ApiEnv>;

export function loadApiEnv(): ApiEnv {
  return parseEnv(ApiEnv);
}
