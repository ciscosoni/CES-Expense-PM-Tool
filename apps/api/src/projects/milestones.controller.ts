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
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateMilestoneDto, UpdateMilestoneDto } from './project.dto.js';
import { MilestonesService } from './milestones.service.js';

@ApiTags('Projects — Milestones')
@ApiBearerAuth()
@Controller('projects/:projectId/milestones')
@UsePipes(ZodValidationPipe)
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}

  @Get()
  list(@Param('projectId', new ParseUUIDPipe()) projectId: string) {
    return this.milestones.list(projectId);
  }

  @Post()
  @Roles('ADMIN', 'PROJECT_MANAGER')
  create(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: CreateMilestoneDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.milestones.create(projectId, body, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'PROJECT_MANAGER')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateMilestoneDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.milestones.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'PROJECT_MANAGER')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.milestones.delete(id, user.id);
  }
}
