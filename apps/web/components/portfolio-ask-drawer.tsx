'use client';

import * as React from 'react';
import { Sparkles, Send, CornerDownLeft } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface AskResponse {
  answer: string;
  source: 'claude' | 'mock';
}

interface Exchange {
  question: string;
  answer?: string;
  source?: 'claude' | 'mock';
  error?: string;
}

const SUGGESTIONS = [
  'Which projects are dragging portfolio margin down?',
  'Which projects are trending below target and why?',
  'Where is the biggest revenue at risk right now?',
  'Summarise portfolio health for a leadership update.',
];

/**
 * Portfolio-wide "Ask AI" drawer (P10 #5). Leadership-facing — the API grounds
 * the answer in a live snapshot (per-project P&L, forward-looking trajectories,
 * KPIs, anomalies) and cites the numbers. Read-only; narrates, never mutates.
 */
export function PortfolioAskDrawer({ triggerClassName }: { triggerClassName?: string }) {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [thread, setThread] = React.useState<Exchange[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    setThread((t) => [...t, { question: q }]);
    setBusy(true);
    try {
      const res = await api.post<AskResponse>('/ai/ask-portfolio', { question: q });
      setThread((t) =>
        t.map((e, i) => (i === t.length - 1 ? { ...e, answer: res.answer, source: res.source } : e)),
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Something went wrong. Try again.';
      setThread((t) => t.map((e, i) => (i === t.length - 1 ? { ...e, error: msg } : e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ai" size="sm" className={cn('gap-1.5', triggerClassName)}>
          <Sparkles className="h-3.5 w-3.5" />
          Ask the portfolio
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          'left-auto right-0 top-0 h-full max-w-md translate-x-0 translate-y-0 rounded-none border-l',
          'flex flex-col gap-0 p-0 sm:rounded-none',
          'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        )}
      >
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[hsl(var(--ai-via))]" />
            Ask the portfolio
          </DialogTitle>
          <DialogDescription>
            Grounded in a live snapshot — per-project P&amp;L, forward-looking trajectories, KPIs, and
            anomalies. Answers cite the numbers.
          </DialogDescription>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {thread.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Ask about the whole portfolio. Try:</p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    disabled={busy}
                    className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-left text-sm text-foreground/90 transition-colors hover:border-[hsl(var(--ai-via)/0.5)] hover:bg-muted/60 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {thread.map((ex, i) => (
            <div key={i} className="space-y-2">
              <div className="ml-auto w-fit max-w-[85%] rounded-lg rounded-br-sm bg-primary/10 px-3 py-2 text-sm">
                {ex.question}
              </div>
              {ex.answer && (
                <div className="w-fit max-w-[90%] space-y-1.5 rounded-lg rounded-bl-sm border bg-card px-3 py-2 text-sm">
                  <p className="whitespace-pre-wrap leading-relaxed text-foreground/90">{ex.answer}</p>
                  {ex.source === 'mock' && (
                    <p className="text-[10px] uppercase tracking-wide text-amber-500/80">
                      Mock — set ANTHROPIC_API_KEY for live answers
                    </p>
                  )}
                </div>
              )}
              {ex.error && (
                <div className="w-fit max-w-[90%] rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {ex.error}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 animate-pulse text-[hsl(var(--ai-via))]" />
              Thinking…
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="border-t p-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              rows={1}
              placeholder="Ask about the portfolio…"
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1.5 flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
            <CornerDownLeft className="h-3 w-3" /> Enter to send · Shift+Enter for newline
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
