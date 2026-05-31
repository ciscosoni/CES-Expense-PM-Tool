import { Injectable, Logger } from '@nestjs/common';
import { AzureBlobStorage } from './azure-blob.storage.js';
import { LocalDiskStorage } from './local-disk.storage.js';
import { buildKey, type BlobPutResult, type BlobStorage } from './storage.types.js';

/**
 * Receipt-file storage. Selects Azure Blob when a connection string is present
 * (cloud), else a local-disk store (dev). Callers use {@link putReceipt} which
 * keys by content hash so identical bytes resolve to the same object.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: BlobStorage;

  constructor() {
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const container = process.env.AZURE_STORAGE_CONTAINER || 'receipts';
    if (conn) {
      this.provider = new AzureBlobStorage(conn, container);
    } else {
      this.provider = new LocalDiskStorage();
    }
    this.logger.log(`Storage provider: ${this.provider.kind}`);
  }

  get kind(): 'local' | 'azure' {
    return this.provider.kind;
  }

  putReceipt(contentHash: string, bytes: Buffer, contentType: string): Promise<BlobPutResult> {
    return this.provider.put(buildKey(contentHash, contentType), bytes, contentType);
  }

  read(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    return this.provider.read(key);
  }
}
