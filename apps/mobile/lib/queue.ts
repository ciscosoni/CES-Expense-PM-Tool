import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError } from './api';

/**
 * Offline-tolerant outbox (non-negotiable #8). Expense+receipt captures are
 * queued in AsyncStorage and flushed when connectivity returns — so a field
 * engineer can capture in a dead zone and it syncs later.
 */
const KEY = 'ces.outbox';

export interface QueuedExpense {
  id: string;
  expense: {
    projectId: string;
    category: string;
    amount: string;
    currency: string;
    incurredOn: string;
    notes?: string | undefined;
  };
  receipt?: {
    fileName: string;
    contentType: string;
    fileBase64: string;
    exifTimestamp?: string;
    exifLat?: number;
    exifLng?: number;
  };
  createdAt: string;
}

async function readAll(): Promise<QueuedExpense[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedExpense[];
  } catch {
    return [];
  }
}
async function writeAll(jobs: QueuedExpense[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(jobs));
}

export async function enqueue(job: Omit<QueuedExpense, 'id' | 'createdAt'>): Promise<void> {
  const jobs = await readAll();
  jobs.push({
    ...job,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
  await writeAll(jobs);
}

export async function pendingCount(): Promise<number> {
  return (await readAll()).length;
}

/** Send one job: create the expense, then attach the receipt. */
async function send(job: QueuedExpense): Promise<void> {
  const created = await api.post<{ id: string }>('/expenses', job.expense);
  if (job.receipt) {
    await api.post('/receipts', { expenseId: created.id, ...job.receipt });
  }
}

/**
 * Flush the outbox. Stops on the first network error (offline) keeping the rest;
 * drops jobs the server rejects as invalid (4xx other than network) to avoid a
 * poison-pill blocking the queue.
 */
export async function flush(): Promise<{ synced: number; remaining: number }> {
  const jobs = await readAll();
  const remaining: QueuedExpense[] = [];
  let synced = 0;
  let offline = false;

  for (const job of jobs) {
    if (offline) {
      remaining.push(job);
      continue;
    }
    try {
      await send(job);
      synced++;
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        // Server rejected the payload — don't retry forever; drop it.
        continue;
      }
      offline = true;
      remaining.push(job);
    }
  }
  await writeAll(remaining);
  return { synced, remaining: remaining.length };
}
