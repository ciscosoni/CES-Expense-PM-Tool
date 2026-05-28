import ExcelJS from 'exceljs';

export interface ColumnSpec<Row> {
  header: string;
  key: keyof Row & string;
  width?: number;
  /** Optional renderer; defaults to the raw value. */
  format?: (value: Row[keyof Row], row: Row) => string | number | Date | null;
}

export interface ExportSheetOptions<Row> {
  sheetName: string;
  columns: readonly ColumnSpec<Row>[];
  rows: readonly Row[];
}

/**
 * Build a single-sheet .xlsx as a Buffer. Caller decides where to write it (disk, blob, HTTP).
 *
 * Header row is bold and frozen. Column widths default to 18 when not specified.
 */
export async function exportRowsToBuffer<Row>(opts: ExportSheetOptions<Row>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CES Tech Internal Tool';
  wb.created = new Date();

  const sheet = wb.addWorksheet(opts.sheetName);
  sheet.columns = opts.columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 18,
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of opts.rows) {
    const out: Record<string, unknown> = {};
    for (const col of opts.columns) {
      const raw = row[col.key];
      out[col.key] = col.format ? col.format(raw, row) : (raw as unknown);
    }
    sheet.addRow(out);
  }

  // ExcelJS returns a Node Buffer at runtime; its own type definitions predate the
  // generic Buffer<TArrayBuffer> in @types/node, so we cast through `unknown` here.
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

/**
 * Import rows from the first sheet of an .xlsx buffer. Headers in row 1 are mapped to
 * the provided column `header` values; each row becomes an object keyed by the column `key`.
 *
 * Cells that the workbook stores as Dates are coerced to ISO date strings to keep parity
 * with our Zod domain schemas. Numbers and strings are returned as-is.
 */
export async function importRowsFromBuffer<Row>(
  buf: Buffer,
  columns: readonly ColumnSpec<Row>[],
): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS's bundled Node types declare `load(buf: Buffer)` against an older Buffer
  // shape that's not structurally assignable to the generic Buffer<ArrayBufferLike>
  // in @types/node@22. Cast to `any` at this third-party boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headerToIdx = new Map<string, number>();
  headerRow.eachCell((cell, colIdx) => {
    const v = cell.value;
    if (typeof v === 'string') headerToIdx.set(v.trim(), colIdx);
  });

  const out: Row[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (!row.hasValues) continue;
    const obj: Record<string, unknown> = {};
    for (const col of columns) {
      const idx = headerToIdx.get(col.header);
      if (idx === undefined) continue;
      let cellValue: unknown = row.getCell(idx).value;
      if (cellValue instanceof Date) {
        cellValue = cellValue.toISOString().slice(0, 10);
      } else if (typeof cellValue === 'object' && cellValue !== null && 'text' in cellValue) {
        cellValue = (cellValue as { text: string }).text;
      }
      obj[col.key] = cellValue;
    }
    out.push(obj as Row);
  }
  return out;
}
