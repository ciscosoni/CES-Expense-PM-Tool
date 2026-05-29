import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  CreateChangeRequestDto,
  RejectChangeRequestDto,
  UpdateChangeRequestDto,
} from './change-requests.dto.js';
import { ChangeRequestsService } from './change-requests.service.js';

@ApiTags('Change Requests')
@ApiBearerAuth()
@Controller('change-requests')
@UsePipes(ZodValidationPipe)
export class ChangeRequestsController {
  constructor(private readonly crs: ChangeRequestsService) {}

  @Get()
  list(@Query('projectId', new ParseUUIDPipe()) projectId: string) {
    return this.crs.listForProject(projectId);
  }

  @Get('inbox')
  @ApiOperation({ summary: 'CRs awaiting your decision (Owner or Admin).' })
  inbox(@CurrentUser() user: AuthedUser) {
    return this.crs.listInbox(user);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.crs.get(id);
  }

  @Post()
  create(@Body() body: CreateChangeRequestDto, @CurrentUser() user: AuthedUser) {
    return this.crs.create(body, user);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateChangeRequestDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.crs.update(id, body, user);
  }

  @Post(':id/submit')
  submit(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.crs.submit(id, user);
  }

  @Post(':id/approve')
  approve(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.crs.approve(id, user);
  }

  @Post(':id/reject')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RejectChangeRequestDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.crs.reject(id, body, user);
  }

  @Post(':id/withdraw')
  withdraw(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.crs.withdraw(id, user);
  }

  @Get('projects/:projectId/baseline')
  @ApiOperation({ summary: 'Baseline vs current snapshot + aggregated deltas for a project.' })
  baseline(@Param('projectId', new ParseUUIDPipe()) projectId: string) {
    return this.crs.baseline(projectId);
  }
}
