import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AiService } from './ai.service.js';
import { CommitOnboardingDto, GenerateOnboardingDto } from './ai.dto.js';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
@UsePipes(ZodValidationPipe)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('project-onboard/generate')
  @Roles('ADMIN', 'PROJECT_OWNER', 'PROJECT_MANAGER')
  @ApiOperation({
    summary:
      'Generate a draft project plan from an RFP / email thread / SOW. Returns a structured plan the Owner reviews before committing.',
  })
  generate(@Body() body: GenerateOnboardingDto) {
    return this.ai.generateOnboarding(body);
  }

  @Post('project-onboard/commit')
  @Roles('ADMIN', 'PROJECT_OWNER')
  @ApiOperation({
    summary:
      'Atomically materialize the reviewed plan: project + milestones + tasks + allocations + baseline. Returns the new project ID.',
  })
  commit(@Body() body: CommitOnboardingDto, @CurrentUser() user: AuthedUser) {
    return this.ai.commitOnboarding(body.plan, user);
  }
}
