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
import type { ClientKind } from '@prisma/client';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateClientDto, UpdateClientDto } from './client.dto.js';
import { ClientsService } from './clients.service.js';

@ApiTags('Master data — Clients (SI / OEM)')
@ApiBearerAuth()
@Controller('master-data/clients')
@UsePipes(ZodValidationPipe)
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @ApiOperation({ summary: 'List clients (filterable by kind: SI or OEM)' })
  list(@Query('kind') kind?: ClientKind, @Query('includeInactive') includeInactive?: string) {
    return this.clients.list({ kind, includeInactive: includeInactive === 'true' });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clients.get(id);
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() body: CreateClientDto, @CurrentUser() user: AuthedUser) {
    return this.clients.create(body, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateClientDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.clients.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  deactivate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.clients.deactivate(id, user.id);
  }
}
