import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { StorageService } from './storage.service.js';

/**
 * Serves locally-stored receipt files (dev). Auth-required (not @Public) so
 * only signed-in users can fetch receipt images; the web reaches it through the
 * same-origin /api proxy which forwards credentials. In Azure the browser
 * fetches the SAS URL directly and this route is unused.
 */
@ApiTags('Files')
@ApiBearerAuth()
@Controller()
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get('files/:key')
  @ApiOperation({ summary: 'Stream a locally-stored receipt file.' })
  async serve(@Param('key') key: string, @Res() res: Response): Promise<void> {
    // Guard against path traversal — keys are `<hex>.<ext>` only.
    if (!/^[A-Za-z0-9._-]+$/.test(key) || key.includes('..')) {
      throw new NotFoundException('Not found');
    }
    const file = await this.storage.read(key);
    if (!file) throw new NotFoundException('Not found');
    res.setHeader('content-type', file.contentType);
    res.setHeader('cache-control', 'private, max-age=3600');
    res.send(file.bytes);
  }
}
