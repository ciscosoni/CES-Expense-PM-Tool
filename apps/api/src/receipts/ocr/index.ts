import { AzureDocIntelProvider } from './azure-docintel.provider.js';
import { MockOcrProvider } from './mock-ocr.provider.js';
import type { OcrProvider } from './ocr.types.js';

export type { OcrProvider, OcrResult } from './ocr.types.js';

/** Azure Document Intelligence when configured, else the local mock. */
export function createOcrProvider(env: {
  AZURE_DOCINTEL_ENDPOINT?: string;
  AZURE_DOCINTEL_KEY?: string;
}): OcrProvider {
  if (env.AZURE_DOCINTEL_ENDPOINT && env.AZURE_DOCINTEL_KEY) {
    return new AzureDocIntelProvider(env.AZURE_DOCINTEL_ENDPOINT, env.AZURE_DOCINTEL_KEY);
  }
  return new MockOcrProvider();
}
