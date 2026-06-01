import { Body, Controller, Get, Post, Put, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AgentsService } from './agents.service.js';
import { AutoApprovalService } from './auto-approval.service.js';
import { UpdateAutoApprovalPolicyDto } from './agents.dto.js';

@ApiTags('Agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly autoApproval: AutoApprovalService,
  ) {}

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

  // ----- Auto-approval (suggest-only) -----

  @Get('auto-approval/policy')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get the suggest-only auto-approval policy.' })
  getPolicy() {
    return this.autoApproval.getPolicy();
  }

  @Put('auto-approval/policy')
  @Roles('ADMIN')
  @UsePipes(ZodValidationPipe)
  @ApiOperation({ summary: 'Update the auto-approval policy (admin). Suggest-only — never auto-acts.' })
  updatePolicy(@Body() body: UpdateAutoApprovalPolicyDto, @CurrentUser() user: AuthedUser) {
    return this.autoApproval.updatePolicy(body, user);
  }

  @Get('auto-approval/suggestions')
  @ApiOperation({
    summary:
      'Clean expenses in your approval queue that pass the policy — surfaced for one-click approval. Read-only.',
  })
  suggestions(@CurrentUser() user: AuthedUser) {
    return this.autoApproval.suggestionsFor(user);
  }
}
