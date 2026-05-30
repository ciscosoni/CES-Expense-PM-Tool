import { Sidebar } from '@/components/sidebar';
import { CommandPalette } from '@/components/command-palette';
import { requireUser } from '@/lib/current-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/60 px-5 backdrop-blur-xl">
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
              <span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-success" />
              Live
            </span>
            <span className="hidden sm:inline">
              Signed in as <span className="text-foreground/90">{user.displayName}</span>
            </span>
          </div>
          <CommandPalette />
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
