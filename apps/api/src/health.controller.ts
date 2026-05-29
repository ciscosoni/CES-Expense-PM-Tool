import { Controller, Get, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './auth/index.js';
import { PrismaService } from './prisma.service.js';

/**
 * Two probes for a managed runtime:
 *   /health  — liveness: am I up at all? No deps; never 5xx unless the process is broken.
 *   /ready   — readiness: am I able to serve traffic? Pings the DB.
 *
 * Container Apps (and any Kubernetes-derived runtime) need both — liveness
 * decides restart, readiness decides whether the load balancer routes traffic
 * to this replica.
 */
@Controller()
export class HealthController {
  private readonly bootedAt = new Date();
  private readonly version = process.env.APP_VERSION ?? 'dev';

  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @Public()
  health() {
    return {
      status: 'ok',
      service: 'ces-internal-api',
      version: this.version,
      bootedAt: this.bootedAt.toISOString(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @Public()
  async ready() {
    try {
      // Cheapest possible DB roundtrip — just confirms the connection is alive.
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ready',
        checks: { database: 'ok' },
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        status: 'not_ready',
        checks: { database: 'down' },
        error: message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
