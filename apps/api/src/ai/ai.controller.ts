import { Body, Controller, Get, Post, Query, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AiService } from './ai.service.js';
import {
  AskDto,
  AskPortfolioDto,
  ClassifyBillableDto,
  CommandDto,
  CommitOnboardingDto,
  ExtractDto,
  ExtractTermsDto,
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

  @Get('onboard/estimate-benchmark')
  @Roles('ADMIN', 'PROJECT_OWNER', 'PROJECT_MANAGER')
  @ApiOperation({
    summary:
      'Estimation memory: benchmark a new project against closed projects in the same category — realized margin + cost mix, and (if a candidate margin is given) whether the plan reads optimistic/conservative vs history.',
  })
  estimateBenchmark(@Query('category') category: string, @Query('marginPercent') marginPercent?: string) {
    const m = marginPercent != null && marginPercent !== '' ? Number(marginPercent) : null;
    return this.ai.estimateBenchmark({
      category: category ?? '',
      marginPercent: m != null && Number.isFinite(m) ? m : null,
    });
  }

  @Post('project-onboard/extract-terms')
  @Roles('ADMIN', 'PROJECT_OWNER', 'PROJECT_MANAGER')
  @ApiOperation({
    summary:
      'Read the commercial terms (client, billing model, contract value, dates, milestones) out of a pasted SOW/PO — each traced to a verbatim quote with a confidence, plus missing/ambiguous flags. The Owner verifies the P&L-baseline numbers before generating the plan.',
  })
  extractTerms(@Body() body: ExtractTermsDto) {
    return this.ai.extractProjectTerms(body);
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

  @Post('ask-portfolio')
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({
    summary:
      'Portfolio-wide grounded Q&A for leadership — answers from a live snapshot (per-project P&L, forward-looking trajectories, KPIs, anomalies), citing project codes and numbers. Read-only.',
  })
  askPortfolio(@Body() body: AskPortfolioDto) {
    return this.ai.askPortfolio(body);
  }

  @Post('classify-billable')
  @Roles('ADMIN', 'FINANCE', 'PROJECT_OWNER', 'PROJECT_MANAGER')
  @ApiOperation({
    summary:
      "Suggest-only second opinion on whether one time log's work is client-billable. Grounded in the task/project; never changes billable status.",
  })
  classifyBillable(@Body() body: ClassifyBillableDto, @CurrentUser() user: AuthedUser) {
    return this.ai.classifyBillable(body, user);
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
