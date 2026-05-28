import { redirect } from 'next/navigation';
import { getDevUserEmail } from '@/lib/auth-cookie';
import { serverFetch } from '@/lib/server-api';
import type { AuthedUser } from '@/lib/types';

/**
 * Root: route the user to the page that matches their role.
 *
 * Admin   → /admin (master data)
 * PM      → /projects (Phase 1B)
 * Finance → /finance (Phase 1E)
 * Approver-only → /approvals (Phase 1C)
 * Engineer (default) → /tasks (Phase 1B)
 */
export default async function HomePage() {
  const email = await getDevUserEmail();
  if (!email) redirect('/login');

  let me: AuthedUser;
  try {
    me = await serverFetch<AuthedUser>('/users/me');
  } catch {
    redirect('/login');
  }

  const roles = me.roles;
  if (roles.includes('ADMIN')) redirect('/admin/grades');
  if (roles.includes('PROJECT_MANAGER')) redirect('/projects');
  if (roles.includes('FINANCE')) redirect('/finance/reimbursements');
  if (roles.includes('APPROVER')) redirect('/approvals');
  redirect('/tasks');
}
