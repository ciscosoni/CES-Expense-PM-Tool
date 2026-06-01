import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/index.js';
import { AgentsService } from './agents.service.js';

@ApiTags('Agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post('daily-brief/run')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Run the AI daily-brief agent now (admin) — for verification.' })
  runDailyBrief() {
    return this.agents.runDailyBrief();
  }

  @Post('anomaly-nudge/run')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Run the anomaly-nudge agent now (admin) — routes open anomalies to owners.' })
  runAnomalyNudges() {
    return this.agents.runAnomalyNudges();
  }

  @Post('standup/run')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Run the standup-digest agent now (admin) — summarises the latest activity day.' })
  runStandup() {
    return this.agents.runStandupDigest();
  }
}
