import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { calculateDa, type DaInput, type DaResult } from '@ces/da-engine';
import type { Prisma, Trip } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthedUser } from '../auth/index.js';
import type { CloseTripDto } from './travel.dto.js';

const ENTITY = 'Trip';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForUser(userId: string) {
    return this.prisma.trip.findMany({
      where: { travelRequest: { userId } },
      include: {
        travelRequest: {
          include: {
            fromCity: { select: { id: true, name: true, tier: true } },
            toCity: { select: { id: true, name: true, tier: true } },
            project: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { actualStart: 'desc' },
    });
  }

  async get(id: string) {
    const t = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        travelRequest: {
          include: {
            user: { select: { id: true, displayName: true, gradeId: true } },
            fromCity: true,
            toCity: true,
            project: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!t) throw new NotFoundException(`Trip ${id} not found`);
    return t;
  }

  /**
   * Start a trip from an APPROVED travel request. Only the requester (or admin)
   * can start it.
   */
  async start(travelRequestId: string, actor: AuthedUser): Promise<Trip> {
    const tr = await this.prisma.travelRequest.findFirst({
      where: { id: travelRequestId, deletedAt: null },
      include: { trip: true },
    });
    if (!tr) throw new NotFoundException(`TravelRequest ${travelRequestId} not found`);
    if (tr.userId !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the requester can start this trip');
    }
    if (tr.status !== 'APPROVED') {
      throw new BadRequestException(`Cannot start a trip from status ${tr.status}`);
    }
    if (tr.trip) {
      throw new BadRequestException('Trip already started');
    }
    const trip = await this.prisma.trip.create({
      data: {
        travelRequestId: tr.id,
        actualStart: new Date(),
      },
    });
    await this.prisma.travelRequest.update({
      where: { id: tr.id },
      data: { status: 'IN_PROGRESS' },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: trip.id,
      action: 'START',
      actorId: actor.id,
      after: trip,
    });
    return trip;
  }

  /**
   * Close a trip — runs DA auto-calc per CLAUDE.md §9 (DA engine), stores the
   * breakdown for the "tap to see derivation" UX (Principle #3), and marks the
   * travel request CLOSED.
   */
  async close(tripId: string, input: CloseTripDto, actor: AuthedUser): Promise<Trip> {
    const trip = await this.get(tripId);
    const tr = trip.travelRequest;
    if (tr.userId !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the requester can close this trip');
    }
    if (trip.actualEnd) {
      throw new BadRequestException('Trip already closed');
    }
    if (!tr.user.gradeId) {
      throw new BadRequestException(
        'User has no grade assigned — DA cannot be computed. Admin must set grade first.',
      );
    }

    const da = await this.computeDa({
      gradeId: tr.user.gradeId,
      cityTier: tr.toCity.tier,
      startDate: tr.startDate.toISOString().slice(0, 10),
      endDate: tr.endDate.toISOString().slice(0, 10),
      tripType: tr.tripType,
    });

    const data: Prisma.TripUpdateInput = {
      actualEnd: input.actualEnd ? new Date(input.actualEnd) : new Date(),
      daEligibleDays: da.eligibleDays.toString(),
      daAmount: da.total.amount,
      daCurrency: da.total.currency,
      daBreakdown: da.breakdown as unknown as Prisma.InputJsonValue,
      travelActualCost: input.travelActualCost,
      lodgingActualCost: input.lodgingActualCost,
      localConveyanceActualCost: input.localConveyanceActualCost,
    };
    const closed = await this.prisma.trip.update({ where: { id: tripId }, data });
    await this.prisma.travelRequest.update({
      where: { id: tr.id },
      data: { status: 'CLOSED' },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: tripId,
      action: 'CLOSE',
      actorId: actor.id,
      before: trip,
      after: closed,
    });
    return closed;
  }

  /**
   * Preview DA without persisting — used by the UI to show the engineer
   * the expected payout before they confirm closure.
   */
  async previewDa(tripId: string): Promise<DaResult> {
    const trip = await this.get(tripId);
    const tr = trip.travelRequest;
    if (!tr.user.gradeId) {
      throw new BadRequestException('User has no grade assigned');
    }
    return this.computeDa({
      gradeId: tr.user.gradeId,
      cityTier: tr.toCity.tier,
      startDate: tr.startDate.toISOString().slice(0, 10),
      endDate: tr.endDate.toISOString().slice(0, 10),
      tripType: tr.tripType,
    });
  }

  private async computeDa(opts: {
    gradeId: string;
    cityTier: DaInput['cityTier'];
    startDate: string;
    endDate: string;
    tripType: DaInput['tripType'];
  }): Promise<DaResult> {
    const entitlements = await this.prisma.entitlementMatrixRow.findMany({
      where: { gradeId: opts.gradeId, cityTier: opts.cityTier },
    });
    const policies = await this.prisma.daPolicy.findMany();
    return calculateDa({
      gradeId: opts.gradeId,
      cityTier: opts.cityTier,
      startDate: opts.startDate,
      endDate: opts.endDate,
      tripType: opts.tripType,
      entitlements: entitlements.map((e) => ({
        id: e.id,
        gradeId: e.gradeId,
        cityTier: e.cityTier,
        perDiemAmount: e.perDiemAmount.toString(),
        perDiemCurrency: e.perDiemCurrency,
        lodgingCapPerNight: e.lodgingCapPerNight.toString(),
        lodgingCurrency: e.lodgingCurrency,
        travelClass: e.travelClass,
        localConveyanceCapPerDay: e.localConveyanceCapPerDay.toString(),
        localConveyanceCurrency: e.localConveyanceCurrency,
        effectiveFrom: e.effectiveFrom.toISOString().slice(0, 10),
      })),
      policies: policies.map((p) => ({
        id: p.id,
        name: p.name,
        partialDayPercent: Number(p.partialDayPercent),
        intraCitySameDayPaysDa: p.intraCitySameDayPaysDa,
        effectiveFrom: p.effectiveFrom.toISOString().slice(0, 10),
      })),
    });
  }
}
