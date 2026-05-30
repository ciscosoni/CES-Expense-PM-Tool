import { Logger } from '@nestjs/common';
import { isPlaceholderTenant } from '../auth/entra.js';
import type { GraphDirectoryProvider, GraphDirectoryUser } from './graph.types.js';

/**
 * Local mock directory — the CES Tech org chart keyed to the seeded emails.
 * Lets the Graph sync pipeline (upsert + manager-chain resolution) run end-to-end
 * without a tenant. It supplies no oids, so it never overwrites a real azureOid.
 */
export class MockGraphProvider implements GraphDirectoryProvider {
  readonly kind = 'mock' as const;

  async listUsers(): Promise<GraphDirectoryUser[]> {
    return [
      { email: 'admin@cestech.in', displayName: 'Admin Singh', jobTitle: 'IT Administrator', department: 'IT' },
      { email: 'owner@cestech.in', displayName: 'Owner Vikram', jobTitle: 'Delivery Head', department: 'Delivery', managerEmail: 'admin@cestech.in' },
      { email: 'pm@cestech.in', displayName: 'PM Aishwarya', jobTitle: 'Project Manager', department: 'Delivery', managerEmail: 'owner@cestech.in' },
      { email: 'finance@cestech.in', displayName: 'Finance Bhargav', jobTitle: 'Finance Manager', department: 'Finance', managerEmail: 'admin@cestech.in' },
      { email: 'engineer@cestech.in', displayName: 'Eng Rohit', jobTitle: 'Network Engineer', department: 'Delivery', managerEmail: 'pm@cestech.in' },
      { email: 'engineer2@cestech.in', displayName: 'Eng Priya', jobTitle: 'Network Engineer', department: 'Delivery', managerEmail: 'pm@cestech.in' },
    ];
  }
}

interface GraphUserRaw {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  jobTitle?: string;
  department?: string;
}

/**
 * Real Microsoft Graph provider (client-credentials). Only used when the tenant
 * and client secret are configured — i.e. in Azure. Verified at deploy time.
 */
export class GraphApiProvider implements GraphDirectoryProvider {
  readonly kind = 'graph' as const;
  private readonly logger = new Logger(GraphApiProvider.name);

  constructor(
    private readonly tenantId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private async token(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    const res = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      { method: 'POST', body },
    );
    if (!res.ok) throw new Error(`Graph token request failed: ${res.status}`);
    const json = (await res.json()) as { access_token: string };
    return json.access_token;
  }

  private async getAll(token: string, url: string): Promise<GraphUserRaw[]> {
    const out: GraphUserRaw[] = [];
    let next: string | null = url;
    while (next) {
      const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Graph users request failed: ${res.status}`);
      const json = (await res.json()) as { value: GraphUserRaw[]; '@odata.nextLink'?: string };
      out.push(...json.value);
      next = json['@odata.nextLink'] ?? null;
    }
    return out;
  }

  async listUsers(): Promise<GraphDirectoryUser[]> {
    const token = await this.token();
    const raw = await this.getAll(
      token,
      'https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=999',
    );
    const users: GraphDirectoryUser[] = [];
    for (const u of raw) {
      const email = (u.mail ?? u.userPrincipalName ?? '').toLowerCase();
      if (!email) continue;
      let managerOid: string | undefined;
      try {
        const mres = await fetch(
          `https://graph.microsoft.com/v1.0/users/${u.id}/manager?$select=id`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (mres.ok) managerOid = ((await mres.json()) as { id: string }).id;
      } catch (err) {
        this.logger.warn(`manager lookup failed for ${email}: ${err}`);
      }
      users.push({
        oid: u.id,
        email,
        displayName: u.displayName ?? email,
        jobTitle: u.jobTitle ?? undefined,
        department: u.department ?? undefined,
        managerOid,
      });
    }
    return users;
  }
}

/** Pick the real provider when fully configured, else the local mock. */
export function createGraphProvider(env: {
  AZURE_TENANT_ID?: string;
  AZURE_API_CLIENT_ID?: string;
  AZURE_API_CLIENT_SECRET?: string;
}): GraphDirectoryProvider {
  const configured =
    !isPlaceholderTenant(env.AZURE_TENANT_ID) &&
    !!env.AZURE_API_CLIENT_ID &&
    !!env.AZURE_API_CLIENT_SECRET;
  if (configured) {
    return new GraphApiProvider(
      env.AZURE_TENANT_ID!,
      env.AZURE_API_CLIENT_ID!,
      env.AZURE_API_CLIENT_SECRET!,
    );
  }
  return new MockGraphProvider();
}
