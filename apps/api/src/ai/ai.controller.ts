import { Body, Controller, Post, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AiService } from './ai.service.js';
import {
  AskDto,
  CommandDto,
  CommitOnboardingDto,
  ExtractDto,
  GenerateOnboardingDto,
} from './ai.dto.js';

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

  @Post('project-onboard/generate/stream')
  @Roles('ADMIN', 'PROJECT_OWNER', 'PROJECT_MANAGER')
  @ApiOperation({
    summary: 'Streaming (SSE) variant of generate — token deltas then the final plan.',
  })
  async generateStream(@Body() body: GenerateOnboardingDto, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    try {
      for await (const event of this.ai.streamOnboarding(body)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'stream error';
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    } finally {
      res.end();
    }
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

  @Post('ask')
  @ApiOperation({
    summary:
      'Grounded Q&A about a single record (expense, trip, or project). Answers cite the derivation. Visibility-enforced; any authenticated user may ask about records they can see.',
  })
  ask(@Body() body: AskDto, @CurrentUser() user: AuthedUser) {
    return this.ai.ask(body, user);
  }

  @Post('extract-expense')
  @ApiOperation({
    summary:
      'Turn a pasted email / message / bill into a structured expense draft the user confirms. Grounds the project guess in active projects.',
  })
  extractExpense(@Body() body: ExtractDto) {
    return this.ai.extractExpense(body);
  }

  @Post('command')
  @ApiOperation({
    summary:
      'Natural-language command bar: a query → a short answer + suggested destinations (read-only; no mutating actions).',
  })
  command(@Body() body: CommandDto) {
    return this.ai.command(body);
  }
}
