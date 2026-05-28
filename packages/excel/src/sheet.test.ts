import { describe, it, expect } from 'vitest';
import { exportRowsToBuffer, importRowsFromBuffer, type ColumnSpec } from './sheet.js';

interface ExpenseRow {
  date: string;
  category: string;
  amount: number;
  notes: string;
}

const columns: ColumnSpec<ExpenseRow>[] = [
  { header: 'Date', key: 'date', width: 12 },
  { header: 'Category', key: 'category' },
  { header: 'Amount', key: 'amount' },
  { header: 'Notes', key: 'notes' },
];

describe('excel sheet round-trip', () => {
  it('exports then re-imports rows preserving values', async () => {
    const rows: ExpenseRow[] = [
      { date: '2025-03-10', category: 'TRAVEL', amount: 12000, notes: 'Mumbai to Delhi flight' },
      { date: '2025-03-11', category: 'LODGING', amount: 6000, notes: 'Hotel night 1' },
    ];
    const buf = await exportRowsToBuffer({ sheetName: 'Expenses', columns, rows });
    expect(buf.byteLength).toBeGreaterThan(0);

    const parsed = await importRowsFromBuffer<ExpenseRow>(buf, columns);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.category).toBe('TRAVEL');
    expect(parsed[0]?.amount).toBe(12000);
    expect(parsed[1]?.notes).toBe('Hotel night 1');
  });
});
