import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { loginAsDevUser } from '@/lib/actions/auth';
import { serverFetch } from '@/lib/server-api';
import type { AuthedUser } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // /users/dev-options is @Public — no auth needed to fetch it.
  let users: AuthedUser[] = [];
  let fetchError: string | null = null;
  try {
    users = await serverFetch<AuthedUser[]>('/users/dev-options');
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to CES Internal</CardTitle>
        <CardDescription>
          Dev mode — pick a seeded user. In production this is replaced by Microsoft Entra ID
          sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {fetchError && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
            <p className="font-medium">
              Couldn&apos;t reach the API at{' '}
              {process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}.
            </p>
            <p className="mt-1">
              Start it with: <code className="font-mono">pnpm --filter @ces/api dev</code>
            </p>
          </div>
        )}
        {users.length === 0 && !fetchError && (
          <p className="text-sm text-muted-foreground">
            No seeded users. Run{' '}
            <code className="font-mono">pnpm --filter @ces/api prisma:seed</code>.
          </p>
        )}
        <ul className="divide-y rounded-md border">
          {users.map((u) => (
            <li key={u.id}>
              <form action={loginAsDevUser}>
                <input type="hidden" name="email" value={u.email} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  <div>
                    <p className="text-sm font-medium">{u.displayName}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} variant="secondary" className="text-[10px]">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
