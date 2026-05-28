import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/index.js';
import { DashboardsService } from './dashboards.service.js';

@ApiTags('Dashboards (leadership)')
@ApiBearerAuth()
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('kpis')
  @Roles('ADMIN', 'PROJECT_MANAGER', 'FINANCE')
  @ApiOperation({ summary: 'Top-of-page KPI cards' })
  kpis() {
    return this.dashboards.kpis();
  }

  @Get('portfolio')
  @Roles('ADMIN', 'PROJECT_MANAGER', 'FINANCE')
  @ApiOperation({ summary: 'Per-project P&L roll-up for the portfolio table' })
  portfolio() {
    return this.dashboards.portfolio();
  }

  @Get('utilization')
  @Roles('ADMIN', 'PROJECT_MANAGER', 'FINANCE')
  @ApiOperation({ summary: 'Engineer-level allocation totals for the current month' })
  utilization() {
    return this.dashboards.utilization();
  }

  @Get('anomalies')
  @Roles('ADMIN', 'PROJECT_MANAGER', 'FINANCE')
  @ApiOperation({ summary: 'Receipt flags + overbooked engineers — the disputes feed' })
  anomalies() {
    return this.dashboards.anomalies();
  }
}
