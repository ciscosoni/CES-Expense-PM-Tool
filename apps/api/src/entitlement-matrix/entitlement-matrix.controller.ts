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
import type { CityTier } from '@prisma/client';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateEntitlementDto, UpdateEntitlementDto } from './entitlement-matrix.dto.js';
import { EntitlementMatrixService } from './entitlement-matrix.service.js';

@ApiTags('Master data — Entitlement Matrix (grade × city tier, time-versioned)')
@ApiBearerAuth()
@Controller('master-data/entitlement-matrix')
@UsePipes(ZodValidationPipe)
export class EntitlementMatrixController {
  constructor(private readonly entitlements: EntitlementMatrixService) {}

  @Get()
  @ApiOperation({
    summary: 'List entitlement rows, optionally filtered by grade and/or tier.',
  })
  list(@Query('gradeId') gradeId?: string, @Query('cityTier') cityTier?: CityTier) {
    return this.entitlements.list({ gradeId, cityTier });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.entitlements.get(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Add a new entitlement row. DA engine picks effective row per trip date.',
  })
  create(@Body() body: CreateEntitlementDto, @CurrentUser() user: AuthedUser) {
    return this.entitlements.create(body, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateEntitlementDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.entitlements.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.entitlements.delete(id, user.id);
  }
}
