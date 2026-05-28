import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { loginAsDevUser } from '@/lib/actions/auth';
import { serverFetch } from '@/lib/server-api';
import type { AuthedUser } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  let users: AuthedUser[] = [];
  let fetchError: string | null = null;
  try {
    users = await serverFetch<AuthedUser[]>('/users/dev-options');
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-[hsl(var(--ai-from))] text-primary-foreground text-sm font-bold shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)]">
          CES
        </div>
        <h1 className="text-xl font-semibold tracking-tight">CES Internal Operations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a seeded user to explore the tool from that role.
        </p>
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-[hsl(var(--ai-via))]" /> Microsoft Entra ID sign-in
          replaces this picker in production.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign in as…</CardTitle>
          <CardDescription>Dev mode · 4 seeded users</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fetchError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <p className="font-medium">
                Couldn&apos;t reach the API at{' '}
                {process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}.
              </p>
              <p className="mt-1">
                Start it: <code className="font-mono">pnpm --filter @ces/api dev</code>
              </p>
            </div>
          )}
          {users.length === 0 && !fetchError && (
            <p className="text-sm text-muted-foreground">
              No seeded users. Run{' '}
              <code className="font-mono">pnpm --filter @ces/api prisma:seed</code>.
            </p>
          )}
          <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
            {users.map((u) => (
              <li key={u.id}>
                <form action={loginAsDevUser}>
                  <input type="hidden" name="email" value={u.email} />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between gap-3 bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{u.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r} variant="secondary" className="text-[10px]">
                          {r.replace('_', ' ')}
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
    </div>
  );
}
