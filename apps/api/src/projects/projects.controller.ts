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
  @ApiOperation({ summary: 'List projects (filterable by status / pmId / clientId)' })
  list(
    @Query('status') status?: ProjectStatus,
    @Query('pmId') pmId?: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.projects.list({ status, pmId, clientId });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.projects.get(id);
  }

  @Post()
  @Roles('ADMIN', 'PROJECT_MANAGER')
  create(@Body() body: CreateProjectDto, @CurrentUser() user: AuthedUser) {
    return this.projects.create(body, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'PROJECT_MANAGER')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateProjectDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.projects.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'PROJECT_MANAGER')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.projects.softDelete(id, user.id);
  }
}
