import { Logger } from '@nestjs/common';
import { parseReceiptText, type ParsedReceipt } from '@ces/evidence';
import type { OcrProvider, OcrResult } from './ocr.types.js';

/**
 * Azure AI Document Intelligence (prebuilt-receipt). Submit → poll → read
 * structured fields (merchant, total, date), falling back to the text parser.
 * Only constructed when endpoint + key are configured (cloud); verified at deploy.
 */
export class AzureDocIntelProvider implements OcrProvider {
  readonly kind = 'azure' as const;
  private readonly logger = new Logger(AzureDocIntelProvider.name);

  constructor(
    private readonly endpoint: string,
    private readonly key: string,
  ) {}

  async extract(bytes: Buffer, contentType: string): Promise<OcrResult> {
    const base = this.endpoint.replace(/\/+$/, '');
    const url = `${base}/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=2024-11-30`;
    const submit = await fetch(url, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': this.key, 'content-type': contentType },
      body: new Uint8Array(bytes),
    });
    if (submit.status !== 202) throw new Error(`Document Intelligence submit failed: ${submit.status}`);
    const opLocation = submit.headers.get('operation-location');
    if (!opLocation) throw new Error('Document Intelligence: missing operation-location');

    // Poll for completion (bounded).
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const poll = await fetch(opLocation, { headers: { 'Ocp-Apim-Subscription-Key': this.key } });
      const json = (await poll.json()) as DocIntelResult;
      if (json.status === 'succeeded') return this.toResult(json);
      if (json.status === 'failed') throw new Error('Document Intelligence analysis failed');
    }
    throw new Error('Document Intelligence: timed out');
  }

  private toResult(json: DocIntelResult): OcrResult {
    const content = json.analyzeResult?.content ?? '';
    const fields = json.analyzeResult?.documents?.[0]?.fields ?? {};
    const parsed: ParsedReceipt = parseReceiptText(content);
    const merchant = fields.MerchantName?.valueString;
    const total = fields.Total?.valueCurrency?.amount ?? fields.Total?.valueNumber;
    const date = fields.TransactionDate?.valueDate;
    if (merchant) parsed.vendor = merchant;
    if (typeof total === 'number') parsed.amount = total.toFixed(2);
    if (date) parsed.date = date;
    if (fields.Total?.valueCurrency?.currencyCode) parsed.currency = fields.Total.valueCurrency.currencyCode;
    return { source: 'azure', rawText: content, parsed };
  }
}

interface DocIntelResult {
  status: 'notStarted' | 'running' | 'succeeded' | 'failed';
  analyzeResult?: {
    content?: string;
    documents?: Array<{
      fields?: Record<
        string,
        {
          valueString?: string;
          valueNumber?: number;
          valueDate?: string;
          valueCurrency?: { amount?: number; currencyCode?: string };
        }
      >;
    }>;
  };
}
