/** Format money string as locale-grouped, e.g. "4,500,000". */
export function formatMoney(amount: string, currency = 'INR'): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${currency} ${amount}`;
  return `${currency} ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Format an ISO date string as YYYY-MM-DD or DD MMM YYYY. */
export function formatDate(iso: string | null | undefined, style: 'iso' | 'long' = 'iso'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (style === 'long') {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return iso.slice(0, 10);
}

/**
 * Project status → traffic-light color (RAG).
 * Caller maps the returned key to a Badge variant or background class.
 */
export function projectStatusColor(status: string): 'green' | 'amber' | 'red' | 'gray' {
  switch (status) {
    case 'ACTIVE':
      return 'green';
    case 'ON_HOLD':
    case 'DRAFT':
      return 'amber';
    case 'CANCELLED':
      return 'red';
    case 'CLOSED':
    default:
      return 'gray';
  }
}
