import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserRole } from '@prisma/client';
import { CurrentUser, Public, type AuthedUser } from '../auth/index.js';
import { resolveAuthMode } from '../auth/entra.js';
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
   * Public, dev-mode helper: lists all seeded users so the web/mobile dev-login
   * picker can render them. Hard-gated to dev auth mode — under Entra it 404s so
   * the directory (names/emails/roles) is never exposed unauthenticated.
   */
  @Get('dev-options')
  @Public()
  @ApiOperation({ summary: 'Dev-only: list seeded users for the login picker.' })
  devOptions() {
    if (resolveAuthMode(process.env) !== 'dev') {
      throw new NotFoundException();
    }
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
