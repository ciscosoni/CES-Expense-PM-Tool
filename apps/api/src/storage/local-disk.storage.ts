import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BlobPutResult, BlobStorage } from './storage.types.js';

/**
 * Local filesystem store for dev. Writes under `.uploads/` (gitignored) and
 * serves through the API's GET /api/files/:key route. Stands in for Azure Blob
 * so the full receipt-evidence pipeline runs offline.
 */
export class LocalDiskStorage implements BlobStorage {
  readonly kind = 'local' as const;
  private readonly baseDir: string;

  constructor(
    baseDir = resolve(process.cwd(), '.uploads'),
    private readonly publicBase = '/api/files',
  ) {
    this.baseDir = baseDir;
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<BlobPutResult> {
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(join(this.baseDir, key), bytes);
    await writeFile(join(this.baseDir, `${key}.type`), contentType, 'utf8');
    return { url: `${this.publicBase}/${key}`, key };
  }

  async read(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    try {
      const bytes = await readFile(join(this.baseDir, key));
      let contentType = 'application/octet-stream';
      try {
        contentType = (await readFile(join(this.baseDir, `${key}.type`), 'utf8')).trim();
      } catch {
        /* default content type */
      }
      return { bytes, contentType };
    } catch {
      return null;
    }
  }
}
