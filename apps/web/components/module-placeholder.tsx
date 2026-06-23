import type { LucideIcon } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';

/**
 * Placeholder for a Workway module whose tab exists (so the navigation matches
 * Workway) but whose functionality is still being built. Lists what the tab
 * will hold so the structure is self-documenting.
 */
export function ModulePlaceholder({
  title,
  description,
  icon: Icon,
  points,
}: {
  title: string;
  description: React.ReactNode;
  icon: LucideIcon;
  points: string[];
}) {
  return (
    <AdminShell title={title} description={description}>
      <Card className="p-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-border/60 bg-elevated/60 text-primary">
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold">{title} — coming from the Workway migration</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">This tab will hold:</p>
          </div>
          <ul className="mx-auto max-w-sm space-y-1.5 text-left text-[13px] text-muted-foreground">
            {points.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-px text-primary">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </AdminShell>
  );
}
