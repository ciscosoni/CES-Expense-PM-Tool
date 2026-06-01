import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { LeaveStatus } from '@prisma/client';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateHolidayDto, CreateLeaveDto, DecideLeaveDto } from './leave.dto.js';
import { LeaveService } from './leave.service.js';

@ApiTags('Leave & Holidays')
@ApiBearerAuth()
@Controller()
@UsePipes(ZodValidationPipe)
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('leave/types')
  types() {
    return this.leave.listTypes();
  }

  @Get('leave/mine')
  @ApiOperation({ summary: 'My leave history.' })
  mine(@CurrentUser() user: AuthedUser) {
    return this.leave.list({ userId: user.id });
  }

  @Get('leave')
  @Roles('ADMIN', 'PROJECT_MANAGER', 'FINANCE')
  @ApiOperation({ summary: 'All leaves (optionally by status).' })
  list(@Query('status') status?: LeaveStatus) {
    return this.leave.list({ status });
  }

  @Get('leave/inbox')
  @Roles('ADMIN', 'PROJECT_MANAGER')
  @ApiOperation({ summary: 'Pending leave requests to approve.' })
  inbox() {
    return this.leave.inbox();
  }

  @Post('leave')
  @ApiOperation({ summary: 'Request leave.' })
  request(@Body() body: CreateLeaveDto, @CurrentUser() user: AuthedUser) {
    return this.leave.request(body, user);
  }

  @Post('leave/:id/approve')
  @Roles('ADMIN', 'PROJECT_MANAGER')
  approve(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: DecideLeaveDto, @CurrentUser() user: AuthedUser) {
    return this.leave.decide(id, true, body, user);
  }

  @Post('leave/:id/reject')
  @Roles('ADMIN', 'PROJECT_MANAGER')
  reject(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: DecideLeaveDto, @CurrentUser() user: AuthedUser) {
    return this.leave.decide(id, false, body, user);
  }

  @Get('holidays')
  holidays() {
    return this.leave.listHolidays();
  }

  @Post('holidays')
  @Roles('ADMIN')
  createHoliday(@Body() body: CreateHolidayDto, @CurrentUser() user: AuthedUser) {
    return this.leave.createHoliday(body.name, body.date, user);
  }

  @Delete('holidays/:id')
  @Roles('ADMIN')
  async deleteHoliday(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.leave.deleteHoliday(id, user);
    return { ok: true };
  }
}
