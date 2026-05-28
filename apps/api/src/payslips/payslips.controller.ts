import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { PayslipsService } from './payslips.service.js';

@ApiTags('Payslips (derived)')
@ApiBearerAuth()
@Controller('payslips')
export class PayslipsController {
  constructor(private readonly payslips: PayslipsService) {}

  @Get('mine')
  @ApiOperation({
    summary: "Current user's payslip derivation for YYYY-MM (defaults to current month)",
  })
  mine(@CurrentUser() user: AuthedUser, @Query('period') period?: string) {
    return this.payslips.derive(user.id, period ?? currentPeriod());
  }

  @Get('users')
  @Roles('FINANCE', 'ADMIN')
  users() {
    return this.payslips.listUsersForPeriod();
  }

  @Get(':userId')
  @Roles('FINANCE', 'ADMIN')
  get(@Param('userId', new ParseUUIDPipe()) userId: string, @Query('period') period?: string) {
    return this.payslips.derive(userId, period ?? currentPeriod());
  }
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
