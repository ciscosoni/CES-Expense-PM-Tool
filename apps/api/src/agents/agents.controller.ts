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
}
