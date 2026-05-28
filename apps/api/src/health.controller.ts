import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/index.js';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  health() {
    return {
      status: 'ok',
      service: 'ces-internal-api',
      timestamp: new Date().toISOString(),
    };
  }
}
