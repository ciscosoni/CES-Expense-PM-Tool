/**
 * Parse a raw OCR text dump from a receipt into structured fields. Pure +
 * deterministic so it is unit-testable and provider-independent: the OCR engine
 * (Azure Document Intelligence in cloud, a mock locally) supplies `rawText`,
 * this turns it into { vendor, amount, currency, date }.
 */

export interface ParsedReceipt {
  vendor?: string;
  amount?: string;
  currency?: string;
  /** ISO date (YYYY-MM-DD) when a date is confidently parsed. */
  date?: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function detectCurrency(text: string): string | undefined {
  if (/₹|\bRs\.?\b|\bINR\b/i.test(text)) return 'INR';
  if (/\$|\bUSD\b/i.test(text)) return 'USD';
  if (/€|\bEUR\b/i.test(text)) return 'EUR';
  return undefined;
}

const DATE_LINE_RE =
  /\b20\d{2}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/-]\d{1,2}[/-]20\d{2}\b|\b\d{1,2}[\s-][A-Za-z]{3,}[\s-]20\d{2}\b/;

function parseAmount(lines: string[]): string | undefined {
  const numRe = /(\d{1,3}(?:[,\s]\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  let best: { score: number; monetary: number; value: number } | null = null;
  const better = (c: { score: number; monetary: number; value: number }): boolean => {
    if (!best) return true;
    if (c.score !== best.score) return c.score > best.score;
    if (c.monetary !== best.monetary) return c.monetary > best.monetary;
    return c.value > best.value;
  };
  for (const line of lines) {
    if (DATE_LINE_RE.test(line)) continue; // never read an amount off a date line
    const lower = line.toLowerCase();
    let score = 0;
    if (/grand\s*total|amount\s*(due|payable)/.test(lower)) score = 3;
    else if (/\btotal\b/.test(lower) && !/sub\s*total/.test(lower)) score = 2;
    else if (/\bamount\b|\bnet\b/.test(lower)) score = 1;
    const hasCurrency = /₹|\bRs\.?\b|\bINR\b|\$|€/i.test(line);
    const matches = line.match(numRe);
    if (!matches) continue;
    for (const m of matches) {
      const value = Number(m.replace(/[,\s]/g, ''));
      if (!Number.isFinite(value) || value <= 0) continue;
      // "Monetary" tokens (decimals or a currency symbol on the line) beat bare
      // integers, so stray counts/years never win when no total keyword exists.
      const monetary = m.includes('.') || hasCurrency ? 1 : 0;
      const cand = { score, monetary, value };
      if (better(cand)) best = cand;
    }
  }
  return best ? best.value.toFixed(2) : undefined;
}

function parseDate(text: string): string | undefined {
  // ISO: 2026-05-31
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return toIso(+iso[1]!, +iso[2]!, +iso[3]!);
  // dd/mm/yyyy or dd-mm-yyyy (assume day-first, the India default)
  const dmy = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (dmy) return toIso(+dmy[3]!, +dmy[2]!, +dmy[1]!);
  // 31 May 2026 / 31-May-2026
  const dMonY = text.match(/\b(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](20\d{2})\b/);
  if (dMonY) {
    const mon = MONTHS[dMonY[2]!.slice(0, 3).toLowerCase()];
    if (mon) return toIso(+dMonY[3]!, mon, +dMonY[1]!);
  }
  return undefined;
}

function toIso(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseVendor(lines: string[]): string | undefined {
  for (const line of lines) {
    const t = line.trim();
    // First substantial line that reads like a name, not a number/label.
    if (t.length >= 3 && /[A-Za-z]/.test(t) && !/receipt|invoice|gst|tax|bill/i.test(t)) {
      const letters = (t.match(/[A-Za-z]/g) ?? []).length;
      if (letters / t.length > 0.5) return t.slice(0, 80);
    }
  }
  return undefined;
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const result: ParsedReceipt = {};
  const vendor = parseVendor(lines);
  const amount = parseAmount(lines);
  const currency = detectCurrency(rawText);
  const date = parseDate(rawText);
  if (vendor) result.vendor = vendor;
  if (amount) result.amount = amount;
  if (currency) result.currency = currency;
  if (date) result.date = date;
  return result;
}
