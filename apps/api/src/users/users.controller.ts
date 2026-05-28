import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserRole } from '@prisma/client';
import { CurrentUser, Public, type AuthedUser } from '../auth/index.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current authenticated user (from request.user).' })
  me(@CurrentUser() user: AuthedUser) {
    return user;
  }

  /**
   * Public, dev-mode helper: lists all seeded users so the web app's dev-login
   * picker can render them. In production this endpoint should be removed or
   * restricted; the MSAL login flow doesn't need it.
   */
  @Get('dev-options')
  @Public()
  @ApiOperation({ summary: 'Dev-only: list seeded users for the login picker.' })
  devOptions() {
    return this.users.list({ includeInactive: false });
  }

  @Get()
  @ApiOperation({ summary: 'List users (active only by default)' })
  list(@Query('role') role?: UserRole, @Query('includeInactive') includeInactive?: string) {
    return this.users.list({ role, includeInactive: includeInactive === 'true' });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.users.get(id);
  }
}
