import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ResolveAnomalyDto, UpdateAnomalyRuleDto } from './anomalies.dto.js';
import { AnomaliesService } from './anomalies.service.js';

@ApiTags('Anomalies')
@ApiBearerAuth()
@Controller('anomalies')
@UsePipes(ZodValidationPipe)
export class AnomaliesController {
  constructor(private readonly anomalies: AnomaliesService) {}

  @Get('rules')
  @Roles('ADMIN', 'PROJECT_OWNER', 'FINANCE')
  rules() {
    return this.anomalies.listRules();
  }

  @Patch('rules/:id')
  @Roles('ADMIN')
  updateRule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateAnomalyRuleDto,
  ) {
    return this.anomalies.updateRule(id, body);
  }

  @Get()
  @Roles('ADMIN', 'PROJECT_OWNER', 'PROJECT_MANAGER', 'FINANCE')
  @ApiOperation({ summary: 'Open anomalies (resolvedAt IS NULL), ordered by severity.' })
  list() {
    return this.anomalies.listOpen();
  }

  @Post('detect')
  @Roles('ADMIN', 'PROJECT_OWNER', 'FINANCE')
  @ApiOperation({ summary: 'Re-run all enabled detection rules and upsert anomalies.' })
  detect() {
    return this.anomalies.runDetector();
  }

  @Post(':id/resolve')
  @Roles('ADMIN', 'PROJECT_OWNER', 'FINANCE')
  resolve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ResolveAnomalyDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.anomalies.resolve(id, body, user);
  }
}
