import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RegularizationStatus } from '@prisma/client';
import { CurrentUser, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  CreateAttendanceEventDto,
  CreateRegularizationDto,
  RejectRegularizationDto,
} from './attendance.dto.js';
import { AttendanceService } from './attendance.service.js';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
@UsePipes(ZodValidationPipe)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // ----- Events -----

  @Post('events')
  @ApiOperation({
    summary:
      "Ingest a raw attendance event (check-in/out, geofence enter/exit). Triggers re-derivation of that day's AttendanceDay row.",
  })
  postEvent(@Body() body: CreateAttendanceEventDto, @CurrentUser() user: AuthedUser) {
    return this.attendance.ingestEvent(body, user);
  }

  @Get('events')
  events(@Query('date') date: string, @CurrentUser() user: AuthedUser) {
    return this.attendance.listEventsForDay(user.id, date);
  }

  // ----- Day summaries -----

  @Get('mine')
  mine(
    @CurrentUser() user: AuthedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendance.listDays({ userId: user.id, from, to });
  }

  @Get('users/:userId/days')
  daysForUser(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendance.listDays({ userId, from, to });
  }

  // ----- Regularizations -----

  @Get('regularizations/mine')
  myRegs(@CurrentUser() user: AuthedUser) {
    return this.attendance.listRegularizations({ userId: user.id });
  }

  @Get('regularizations/inbox')
  @ApiOperation({ summary: 'All SUBMITTED regularizations awaiting a manager decision.' })
  regInbox() {
    return this.attendance.listRegularizations({ status: 'SUBMITTED' });
  }

  @Get('regularizations')
  listRegs(@Query('userId') userId?: string, @Query('status') status?: RegularizationStatus) {
    return this.attendance.listRegularizations({ userId, status });
  }

  @Post('regularizations')
  submit(@Body() body: CreateRegularizationDto, @CurrentUser() user: AuthedUser) {
    return this.attendance.createRegularization(body, user);
  }

  @Post('regularizations/:id/approve')
  approve(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.attendance.approve(id, user);
  }

  @Post('regularizations/:id/reject')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RejectRegularizationDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.attendance.reject(id, body, user);
  }

  @Post('regularizations/:id/cancel')
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.attendance.cancel(id, user);
  }
}
