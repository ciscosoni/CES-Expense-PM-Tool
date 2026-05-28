import { Sidebar } from '@/components/sidebar';
import { CommandPalette } from '@/components/command-palette';
import { requireUser } from '@/lib/current-user';
import { Badge } from '@/components/ui/badge';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar user={user} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono text-[10px]">
              dev mode
            </Badge>
            <span>Signed in as {user.displayName}</span>
          </div>
          <CommandPalette />
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
