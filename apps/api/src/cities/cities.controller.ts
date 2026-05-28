import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateCityDto, UpdateCityDto } from './city.dto.js';
import { CitiesService } from './cities.service.js';

@ApiTags('Master data — Cities')
@ApiBearerAuth()
@Controller('master-data/cities')
@UsePipes(ZodValidationPipe)
export class CitiesController {
  constructor(private readonly cities: CitiesService) {}

  @Get()
  @ApiOperation({ summary: 'List cities (filterable by tier, country)' })
  list(
    @Query('tier') tier?: CityTier,
    @Query('country') country?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.cities.list({ tier, country, includeInactive: includeInactive === 'true' });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cities.get(id);
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() body: CreateCityDto, @CurrentUser() user: AuthedUser) {
    return this.cities.create(body, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateCityDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.cities.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Deactivate a city (cities are not hard-deleted; trips may reference them)',
  })
  deactivate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.cities.deactivate(id, user.id);
  }
}
