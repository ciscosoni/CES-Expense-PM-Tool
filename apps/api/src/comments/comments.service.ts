import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Comment, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthedUser } from '../auth/index.js';
import type { CreateCommentDto, UpdateCommentDto } from './comments.dto.js';

const ENTITY = 'Comment';
const COMMENT_INCLUDE = {
  author: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.CommentInclude;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForEntity(entityKind: string, entityId: string) {
    return this.prisma.comment.findMany({
      where: { entityKind, entityId, deletedAt: null },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(input: CreateCommentDto, actor: AuthedUser): Promise<Comment> {
    const data: Prisma.CommentCreateInput = {
      entityKind: input.entityKind,
      entityId: input.entityId,
      author: { connect: { id: actor.id } },
      body: input.body,
      ...(input.parentId ? { parent: { connect: { id: input.parentId } } } : {}),
      ...(input.entityKind === 'CHANGE_REQUEST'
        ? { changeRequest: { connect: { id: input.entityId } } }
        : {}),
    };
    const created = await this.prisma.comment.create({ data });
    await this.audit.log({
      entity: ENTITY,
      entityId: created.id,
      action: 'CREATE',
      actorId: actor.id,
      after: created,
    });
    return created;
  }

  async update(id: string, input: UpdateCommentDto, actor: AuthedUser): Promise<Comment> {
    const before = await this.getOr404(id);
    if (before.authorId !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the author can edit a comment.');
    }
    const after = await this.prisma.comment.update({
      where: { id },
      data: { body: input.body },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }

  async delete(id: string, actor: AuthedUser): Promise<void> {
    const before = await this.getOr404(id);
    if (before.authorId !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the author can delete a comment.');
    }
    await this.prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'DELETE',
      actorId: actor.id,
      before,
    });
  }

  private async getOr404(id: string) {
    const c = await this.prisma.comment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!c) throw new NotFoundException(`Comment ${id} not found`);
    return c;
  }
}
