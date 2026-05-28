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
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateGradeDto, UpdateGradeDto } from './grade.dto.js';
import { GradesService } from './grades.service.js';

@ApiTags('Master data — Grades')
@ApiBearerAuth()
@Controller('master-data/grades')
@UsePipes(ZodValidationPipe)
export class GradesController {
  constructor(private readonly grades: GradesService) {}

  @Get()
  @ApiOperation({ summary: 'List grades (active only by default)' })
  list(
    @Query('includeInactive') includeInactive?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.grades.list({
      includeInactive: includeInactive === 'true',
      includeDeleted: includeDeleted === 'true',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one grade by id' })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.grades.get(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Create a grade (ADMIN only)' })
  create(@Body() body: CreateGradeDto, @CurrentUser() user: AuthedUser) {
    return this.grades.create(body, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update a grade (ADMIN only)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateGradeDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.grades.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a grade (ADMIN only). See POST /:id/restore to undo.' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.grades.softDelete(id, user.id);
  }

  @Post(':id/restore')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Restore a soft-deleted grade (ADMIN only)' })
  restore(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.grades.restore(id, user.id);
  }
}
