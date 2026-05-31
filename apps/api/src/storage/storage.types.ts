export interface BlobPutResult {
  /** URL the web can render the file from (served route locally, SAS in Azure). */
  url: string;
  key: string;
}

/** Pluggable receipt-file store: local filesystem in dev, Azure Blob in cloud. */
export interface BlobStorage {
  readonly kind: 'local' | 'azure';
  put(key: string, bytes: Buffer, contentType: string): Promise<BlobPutResult>;
  /** Read back for the local serve route; null when the provider serves directly (SAS). */
  read(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

/** Deterministic object key from content hash + type (so identical files dedupe). */
export function buildKey(contentHash: string, contentType: string): string {
  const ext = EXT_BY_TYPE[contentType.toLowerCase()] ?? 'bin';
  return `${contentHash}.${ext}`;
}
