import {
  BlobSASPermissions,
  BlobServiceClient,
  type ContainerClient,
} from '@azure/storage-blob';
import type { BlobPutResult, BlobStorage } from './storage.types.js';

/**
 * Azure Blob store for production. Uploads the file and returns a short-lived
 * SAS URL the browser can fetch directly. Only constructed when a connection
 * string is configured (cloud); verified at deploy time.
 */
export class AzureBlobStorage implements BlobStorage {
  readonly kind = 'azure' as const;
  private container: ContainerClient;
  private ensured = false;

  constructor(connectionString: string, containerName: string) {
    const service = BlobServiceClient.fromConnectionString(connectionString);
    this.container = service.getContainerClient(containerName);
  }

  private async ensure(): Promise<void> {
    if (!this.ensured) {
      await this.container.createIfNotExists();
      this.ensured = true;
    }
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<BlobPutResult> {
    await this.ensure();
    const blob = this.container.getBlockBlobClient(`receipts/${key}`);
    await blob.uploadData(bytes, { blobHTTPHeaders: { blobContentType: contentType } });
    const url = await blob.generateSasUrl({
      permissions: BlobSASPermissions.parse('r'),
      expiresOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return { url, key };
  }

  async read(): Promise<{ bytes: Buffer; contentType: string } | null> {
    // The browser fetches the SAS URL directly; no serve-route round-trip.
    return null;
  }
}
