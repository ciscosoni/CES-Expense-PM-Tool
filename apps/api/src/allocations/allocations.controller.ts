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
import { CreateAllocationDto, UpdateAllocationDto } from './allocation.dto.js';
import { AllocationsService } from './allocations.service.js';

@ApiTags('Allocations (resource capacity, with overlap detection)')
@ApiBearerAuth()
@Controller('allocations')
@UsePipes(ZodValidationPipe)
export class AllocationsController {
  constructor(private readonly allocations: AllocationsService) {}

  @Get()
  @ApiOperation({ summary: 'List allocations (filter by userId or projectId)' })
  list(@Query('userId') userId?: string, @Query('projectId') projectId?: string) {
    return this.allocations.list({ userId, projectId });
  }

  @Post()
  @Roles('ADMIN', 'PROJECT_MANAGER')
  @ApiOperation({ summary: 'Create allocation. Rejects if user would exceed 100% in the period.' })
  create(@Body() body: CreateAllocationDto, @CurrentUser() user: AuthedUser) {
    return this.allocations.create(body, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'PROJECT_MANAGER')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateAllocationDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.allocations.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'PROJECT_MANAGER')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.allocations.delete(id, user.id);
  }
}
