import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/index.js';
import { ForecastService } from './forecast.service.js';

/**
 * P8 forward-looking risk. Leadership-only (ADMIN) — these are portfolio-wide
 * predictive signals, not per-record data.
 */
@ApiTags('Forecast')
@ApiBearerAuth()
@Controller('forecast')
export class ForecastController {
  constructor(private readonly forecast: ForecastService) {}

  @Get('summary')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Compact forward-looking risk counts for the dashboard.' })
  summary() {
    return this.forecast.summary();
  }

  @Get('margins')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Projected end-of-engagement margin per active project.' })
  margins() {
    return this.forecast.marginForecasts();
  }

  @Get('utilization')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Engineers projected to be overbooked next month.' })
  utilization() {
    return this.forecast.utilizationRisk();
  }

  @Get('expense-spike')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Org-wide monthly expense trend + spike flag.' })
  expenseSpike() {
    return this.forecast.expenseSpike();
  }

  @Get('wellbeing')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Overwork-risk signals per engineer (employee-protective).' })
  wellbeing() {
    return this.forecast.wellbeing();
  }
}
