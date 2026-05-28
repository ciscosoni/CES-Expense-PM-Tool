import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TravelStatus } from '@prisma/client';
import { CurrentUser, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CloseTripDto, CreateTravelRequestDto, RejectTravelRequestDto } from './travel.dto.js';
import { TravelRequestsService } from './travel-requests.service.js';
import { TripsService } from './trips.service.js';

@ApiTags('Travel & Trips')
@ApiBearerAuth()
@Controller()
@UsePipes(ZodValidationPipe)
export class TravelController {
  constructor(
    private readonly requests: TravelRequestsService,
    private readonly trips: TripsService,
  ) {}

  // ---- TravelRequest ----

  @Get('travel-requests')
  @ApiOperation({ summary: 'List travel requests (filter by status / projectId / userId)' })
  list(
    @Query('status') status?: TravelStatus,
    @Query('projectId') projectId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.requests.list({ status, projectId, userId });
  }

  @Get('travel-requests/mine')
  @ApiOperation({ summary: "Current user's travel requests" })
  mine(@CurrentUser() user: AuthedUser) {
    return this.requests.list({ userId: user.id });
  }

  @Get('travel-requests/inbox')
  @ApiOperation({ summary: 'Pending approvals routed to current user (as project PM)' })
  inbox(@CurrentUser() user: AuthedUser) {
    return this.requests.list({ pendingForApproverId: user.id });
  }

  @Get('travel-requests/:id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.requests.get(id);
  }

  @Post('travel-requests')
  create(@Body() body: CreateTravelRequestDto, @CurrentUser() user: AuthedUser) {
    return this.requests.create(body, user);
  }

  @Post('travel-requests/:id/submit')
  submit(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.requests.submit(id, user);
  }

  @Post('travel-requests/:id/approve')
  approve(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.requests.approve(id, user);
  }

  @Post('travel-requests/:id/reject')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RejectTravelRequestDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.requests.reject(id, body, user);
  }

  // ---- Trip (the trip life-cycle hanging off an approved request) ----

  @Get('trips/mine')
  myTrips(@CurrentUser() user: AuthedUser) {
    return this.trips.listForUser(user.id);
  }

  @Get('trips/:id')
  getTrip(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.trips.get(id);
  }

  @Post('travel-requests/:id/start-trip')
  startTrip(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.trips.start(id, user);
  }

  @Get('trips/:id/da-preview')
  @ApiOperation({
    summary:
      'Preview DA breakdown for a trip before closure. Solves the "wrong calculation" pain point.',
  })
  previewDa(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.trips.previewDa(id);
  }

  @Post('trips/:id/close')
  closeTrip(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CloseTripDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.trips.close(id, body, user);
  }
}
