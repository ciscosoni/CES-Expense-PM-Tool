'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, api } from '@/lib/api';

/**
 * Tiny abstraction for the master-data CRUD pattern. All seven admin pages
 * use this so they stay near-identical and easy to scan.
 */
export function useResource<T, CreateInput, UpdateInput>(
  resource: string,
  opts: { listQuery?: Record<string, string | undefined> } = {},
) {
  const qc = useQueryClient();
  const path = `/master-data/${resource}`;
  const key = [resource, opts.listQuery ?? {}];

  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<T[]>(path, { query: opts.listQuery ?? {} }),
  });

  const create = useMutation({
    mutationFn: (input: CreateInput) => api.post<T>(path, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [resource] });
      toast.success('Created');
    },
    onError: (err) => toast.error(formatError(err)),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInput }) =>
      api.patch<T>(`${path}/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [resource] });
      toast.success('Updated');
    },
    onError: (err) => toast.error(formatError(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<void>(`${path}/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [resource] });
      toast.success('Deleted');
    },
    onError: (err) => toast.error(formatError(err)),
  });

  return { list, create, update, remove };
}

function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.body && typeof err.body === 'object' && 'issues' in err.body) {
      const issues = (err.body as { issues: { path: string; message: string }[] }).issues;
      return issues.map((i) => `${i.path}: ${i.message}`).join('\n');
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
