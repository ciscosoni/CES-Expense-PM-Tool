import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, TravelRequest } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AuthedUser } from '../auth/index.js';
import type { CreateTravelRequestDto, RejectTravelRequestDto } from './travel.dto.js';

const ENTITY = 'TravelRequest';

const TR_INCLUDE = {
  user: { select: { id: true, displayName: true, email: true, gradeId: true, managerId: true } },
  project: { select: { id: true, code: true, name: true, pmId: true } },
  fromCity: { select: { id: true, name: true, tier: true } },
  toCity: { select: { id: true, name: true, tier: true } },
  approver: { select: { id: true, displayName: true, email: true } },
  trip: true,
} satisfies Prisma.TravelRequestInclude;

@Injectable()
export class TravelRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(opts: {
    userId?: string | undefined;
    projectId?: string | undefined;
    status?: TravelRequest['status'] | undefined;
    /** "pending" = SUBMITTED awaiting approval. */
    pendingForApproverId?: string | undefined;
  }) {
    const where: Prisma.TravelRequestWhereInput = {
      deletedAt: null,
      ...(opts.userId ? { userId: opts.userId } : {}),
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
      // Pending inbox: SUBMITTED requests where the actor is either the project
      // PM or the requester's reporting manager (from the Graph-synced chain).
      ...(opts.pendingForApproverId
        ? {
            status: 'SUBMITTED',
            OR: [
              { project: { pmId: opts.pendingForApproverId } },
              { user: { managerId: opts.pendingForApproverId } },
            ],
          }
        : {}),
    };
    return this.prisma.travelRequest.findMany({
      where,
      include: TR_INCLUDE,
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    });
  }

  async get(id: string) {
    const tr = await this.prisma.travelRequest.findFirst({
      where: { id, deletedAt: null },
      include: TR_INCLUDE,
    });
    if (!tr) throw new NotFoundException(`TravelRequest ${id} not found`);
    return tr;
  }

  async create(input: CreateTravelRequestDto, actor: AuthedUser): Promise<TravelRequest> {
    if (input.startDate > input.endDate) {
      throw new BadRequestException('startDate must be on or before endDate');
    }
    const created = await this.prisma.travelRequest.create({
      data: {
        userId: actor.id,
        projectId: input.projectId,
        fromCityId: input.fromCityId,
        toCityId: input.toCityId,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        travelClass: input.travelClass,
        tripType: input.tripType,
        purpose: input.purpose,
        status: 'DRAFT',
      },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: created.id,
      action: 'CREATE',
      actorId: actor.id,
      after: created,
    });
    return created;
  }

  async submit(id: string, actor: AuthedUser): Promise<TravelRequest> {
    const before = await this.get(id);
    if (before.userId !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the requester can submit this travel request');
    }
    if (before.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot submit from status ${before.status}`);
    }
    const after = await this.prisma.travelRequest.update({
      where: { id },
      data: { status: 'SUBMITTED' },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'SUBMIT',
      actorId: actor.id,
      before,
      after,
    });

    // Notify the approvers: project PM + the requester's reporting manager.
    await this.notifications.notifyMany(
      [before.project?.pmId, before.user.managerId].filter((x): x is string => !!x),
      {
        kind: 'TRAVEL_APPROVAL_REQUESTED',
        title: `Travel request from ${before.user.displayName}`,
        body: `${before.fromCity.name} → ${before.toCity.name}, ${new Date(before.startDate).toISOString().slice(0, 10)}`,
        severity: 'INFO',
        entityKind: 'TRAVEL',
        entityId: id,
        linkPath: '/travel/inbox',
      },
    );
    return after;
  }

  async approve(id: string, actor: AuthedUser): Promise<TravelRequest> {
    const before = await this.get(id);
    this.assertCanApprove(before, actor);
    if (before.status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot approve from status ${before.status}`);
    }
    const after = await this.prisma.travelRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approverId: actor.id,
        approvedAt: new Date(),
        rejectReason: null,
      },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'APPROVE',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }

  async reject(
    id: string,
    input: RejectTravelRequestDto,
    actor: AuthedUser,
  ): Promise<TravelRequest> {
    const before = await this.get(id);
    this.assertCanApprove(before, actor);
    if (before.status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot reject from status ${before.status}`);
    }
    const after = await this.prisma.travelRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approverId: actor.id,
        approvedAt: new Date(),
        rejectReason: input.reason,
      },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'REJECT',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }

  private assertCanApprove(
    tr: { project: { pmId: string } | null; user: { managerId: string | null } },
    actor: AuthedUser,
  ): void {
    if (actor.roles.includes('ADMIN')) return;
    if (tr.project && tr.project.pmId === actor.id) return;
    // Reporting manager (Graph-synced chain) is also an authorized approver.
    if (tr.user.managerId && tr.user.managerId === actor.id) return;
    throw new ForbiddenException(
      'Only the project PM, the requester’s reporting manager, or an admin can approve/reject this travel request',
    );
  }
}
