'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquare } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Comment, CommentEntityKind } from '@/lib/types';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

/**
 * Polymorphic comments. Pass the `entityKind` + `entityId` and you get a
 * thread surface attached to any commentable record (PROJECT, TASK,
 * CHANGE_REQUEST, …). Drives the "tap to see the dispute trail" UX promised
 * by principle #2 (visibility-first).
 */
export function CommentsThread({
  entityKind,
  entityId,
  title = 'Discussion',
}: {
  entityKind: CommentEntityKind;
  entityId: string;
  title?: string;
}) {
  const qc = useQueryClient();
  const [body, setBody] = React.useState('');

  const list = useQuery({
    queryKey: ['comments', entityKind, entityId],
    queryFn: () =>
      api.get<Comment[]>('/comments', { query: { entityKind, entityId } }),
  });
  const create = useMutation({
    mutationFn: () => api.post('/comments', { entityKind, entityId, body, parentId: null }),
    onSuccess: () => {
      setBody('');
      void qc.invalidateQueries({ queryKey: ['comments', entityKind, entityId] });
      toast.success('Posted');
    },
    onError: (err: unknown) => toast.error(err instanceof ApiError ? err.message : String(err)),
  });

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">{title}</p>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          {list.data?.length ?? 0} message{list.data?.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto p-4">
        {list.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {list.data?.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No comments yet — be the first to leave context.
          </p>
        )}
        <ul className="space-y-3">
          {list.data?.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{c.author.displayName}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {formatDate(c.createdAt, 'long')}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/90">{c.body}</p>
            </li>
          ))}
        </ul>
      </div>
      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim().length === 0) return;
          create.mutate();
        }}
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={2}
          className="min-h-[60px]"
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Threaded, audited, visible to anyone with access to this {entityKind.toLowerCase()}.
          </p>
          <Button type="submit" size="sm" disabled={create.isPending || body.trim().length === 0}>
            {create.isPending ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </form>
    </div>
  );
}
