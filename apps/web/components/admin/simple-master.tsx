'use client';

import * as React from 'react';
import { Plus, Ban } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { useResource } from '@/components/admin/use-resource';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Item {
  id: string;
  name: string;
  active: boolean;
  employeeCount: number;
}

/** Generic CRUD admin for a simple { name, active } master entity + headcount. */
export function SimpleMasterAdmin({
  resource,
  title,
  description,
  noun,
}: {
  resource: string;
  title: string;
  description: string;
  noun: string;
}) {
  const r = useResource<Item, { name: string }, { name?: string; active?: boolean }>(resource, {
    listQuery: { includeInactive: 'true' },
  });
  const items = r.list.data ?? [];
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');

  function submit() {
    if (!name.trim()) return;
    r.create.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          setName('');
          setOpen(false);
        },
      },
    );
  }

  return (
    <AdminShell
      title={title}
      description={description}
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> New {noun}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New {noun}</DialogTitle>
            </DialogHeader>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button onClick={submit} disabled={r.create.isPending || !name.trim()}>
                {r.create.isPending ? 'Saving…' : `Create ${noun}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead className="w-32 text-right">Employees</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.list.isLoading && <TableEmpty colSpan={4}>Loading…</TableEmpty>}
            {!r.list.isLoading && items.length === 0 && (
              <TableEmpty colSpan={4}>No {noun}s yet.</TableEmpty>
            )}
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="text-sm font-medium">{it.name}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {it.employeeCount}
                </TableCell>
                <TableCell>
                  {it.active ? (
                    <Badge variant="success" dot>
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {it.active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] text-muted-foreground"
                      disabled={r.remove.isPending}
                      onClick={() => r.remove.mutate(it.id)}
                    >
                      <Ban className="h-3 w-3" /> Deactivate
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AdminShell>
  );
}
