import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ProjectStatus } from '@prisma/client';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateProjectDto, UpdateProjectDto } from './project.dto.js';
import { ProjectsService } from './projects.service.js';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
@UsePipes(ZodValidationPipe)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List projects (auto-scoped by role: ADMIN/FINANCE see all, OWNER sees owned, PM sees managed, ENGINEER sees assigned).',
  })
  list(
    @CurrentUser() user: AuthedUser,
    @Query('status') status?: ProjectStatus,
    @Query('pmId') pmId?: string,
    @Query('ownerId') ownerId?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.projects.list(user, { status, pmId, ownerId, clientId });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.projects.get(id);
  }

  @Get(':id/billable-review')
  @ApiOperation({
    summary:
      'Billable time whose justification is weak or missing — the hours a client would dispute first. Read-only flags (scored deterministically); never changes billable status.',
  })
  billableReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.projects.billableReview(id, user, { from, to });
  }

  @Post()
  @Roles('ADMIN', 'PROJECT_OWNER')
  @ApiOperation({
    summary: 'Create project. Only ADMIN or PROJECT_OWNER can create (Slice 2B redesign).',
  })
  create(@Body() body: CreateProjectDto, @CurrentUser() user: AuthedUser) {
    return this.projects.create(body, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'PROJECT_OWNER', 'PROJECT_MANAGER')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateProjectDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.projects.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'PROJECT_OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.projects.softDelete(id, user.id);
  }
}
