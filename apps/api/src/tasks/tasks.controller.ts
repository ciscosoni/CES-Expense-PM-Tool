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
import type { TaskStatus } from '@prisma/client';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateTaskDto, CreateTimeLogDto, UpdateTaskDto } from './task.dto.js';
import { TasksService } from './tasks.service.js';

@ApiTags('Tasks & TimeLogs')
@ApiBearerAuth()
@Controller()
@UsePipes(ZodValidationPipe)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  // ---- Tasks ----

  @Get('tasks')
  @ApiOperation({ summary: 'List tasks (filter by projectId, assigneeId, status)' })
  list(
    @Query('projectId') projectId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('status') status?: TaskStatus,
  ) {
    return this.tasks.list({ projectId, assigneeId, status });
  }

  @Get('tasks/mine')
  @ApiOperation({ summary: "Current user's assigned tasks" })
  mine(@CurrentUser() user: AuthedUser, @Query('status') status?: TaskStatus) {
    return this.tasks.list({ assigneeId: user.id, status });
  }

  @Get('tasks/:id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tasks.get(id);
  }

  @Post('tasks')
  @Roles('ADMIN', 'PROJECT_MANAGER')
  create(@Body() body: CreateTaskDto, @CurrentUser() user: AuthedUser) {
    return this.tasks.create(body, user.id);
  }

  @Patch('tasks/:id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateTaskDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.tasks.update(id, body, user.id);
  }

  @Delete('tasks/:id')
  @Roles('ADMIN', 'PROJECT_MANAGER')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.tasks.delete(id, user.id);
  }

  // ---- TimeLogs ----

  @Post('time-logs')
  @ApiOperation({ summary: 'Log time against a task (assignee or PM/admin only)' })
  logTime(@Body() body: CreateTimeLogDto, @CurrentUser() user: AuthedUser) {
    return this.tasks.logTime(body, user);
  }

  @Delete('time-logs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLog(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.tasks.deleteTimeLog(id, user);
  }

  @Get('time-logs/mine')
  myLogs(
    @CurrentUser() user: AuthedUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.tasks.listTimeLogsForUser(user.id, { dateFrom, dateTo });
  }
}
