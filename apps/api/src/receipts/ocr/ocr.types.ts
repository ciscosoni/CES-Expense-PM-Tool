import type { ParsedReceipt } from '@ces/evidence';

export interface OcrResult {
  source: 'azure' | 'mock';
  rawText: string;
  parsed: ParsedReceipt;
}

/** Pluggable OCR: Azure Document Intelligence in cloud, a deterministic mock locally. */
export interface OcrProvider {
  readonly kind: 'azure' | 'mock';
  extract(bytes: Buffer, contentType: string): Promise<OcrResult>;
}
