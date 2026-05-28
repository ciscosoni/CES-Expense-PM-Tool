import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

/**
 * Receipt upload payload. For v1 the file is sent base64 in `fileBase64`.
 * Production swap (Slice 1F): pre-signed Azure Blob upload URL + post-creation.
 *
 * The server derives `contentHash` (SHA-256), reads EXIF if present, and
 * extracts a perceptual hash + OCR result so the founder's fake/duplicate
 * receipt pain point can be detected at submission time.
 */
export const CreateReceiptSchema = z.object({
  expenseId: z.string().uuid(),
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(1).max(80),
  fileBase64: z.string().min(8),
  /// Caller can pre-supply EXIF if it extracted them client-side (mobile).
  exifTimestamp: z.string().datetime().optional(),
  exifLat: z.number().min(-90).max(90).optional(),
  exifLng: z.number().min(-180).max(180).optional(),
});
export class CreateReceiptDto extends createZodDto(CreateReceiptSchema) {}
export interface CreateReceiptDto extends z.infer<typeof CreateReceiptSchema> {}
