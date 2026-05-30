/** A directory user as returned by a {@link GraphDirectoryProvider}. */
export interface GraphDirectoryUser {
  /** Entra object id (real provider). Absent for the local mock. */
  oid?: string | undefined;
  email: string;
  displayName: string;
  jobTitle?: string | undefined;
  department?: string | undefined;
  /** Manager linkage — resolved by oid first, then email. */
  managerOid?: string | undefined;
  managerEmail?: string | undefined;
}

/**
 * Pluggable source of the people directory. Real implementation talks to
 * Microsoft Graph; the local mock returns the CES org chart so the sync is
 * exercisable without a tenant.
 */
export interface GraphDirectoryProvider {
  readonly kind: 'graph' | 'mock';
  listUsers(): Promise<GraphDirectoryUser[]>;
}

export interface GraphSyncResult {
  source: 'graph' | 'mock';
  /** Users created or updated. */
  synced: number;
  /** Manager links resolved. */
  managersLinked: number;
}
