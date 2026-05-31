import { parseReceiptText } from '@ces/evidence';
import type { OcrProvider, OcrResult } from './ocr.types.js';

/**
 * Deterministic local stand-in for OCR. Derives a stable pseudo amount from the
 * file bytes so different receipts yield different (but reproducible) values,
 * making the auto-fill flow demoable offline. Clearly flagged `source: 'mock'`;
 * real text extraction flips on with Azure Document Intelligence in cloud.
 */
export class MockOcrProvider implements OcrProvider {
  readonly kind = 'mock' as const;

  async extract(bytes: Buffer): Promise<OcrResult> {
    let seed = 0;
    for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
      seed = (seed * 31 + bytes[i]!) % 1_000_003;
    }
    const amount = (100 + (seed % 4900) + (seed % 100) / 100).toFixed(2);
    const vendor = `Vendor ${(seed % 900) + 100}`;
    const rawText = `${vendor}\nGST Invoice\nGrand Total ₹ ${amount}`;
    return { source: 'mock', rawText, parsed: parseReceiptText(rawText) };
  }
}
