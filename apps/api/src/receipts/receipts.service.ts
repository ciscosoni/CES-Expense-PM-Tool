import * as crypto from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Receipt, type ReceiptFlag } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthedUser } from '../auth/index.js';
import type { CreateReceiptDto } from './receipt.dto.js';

const ENTITY = 'Receipt';

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForExpense(expenseId: string) {
    return this.prisma.receipt.findMany({
      where: { expenseId },
      include: { flags: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Accept a receipt upload, derive fraud-detection flags, persist both.
   *
   * Current implementations are explicit stubs that solve the pain point at
   * the *contract* level — exact-duplicate hash detection is real (SHA-256);
   * perceptual hash, OCR amount, and EXIF GPS comparisons are stubbed and
   * lit up in Slice 1F (mobile + Azure Blob).
   *
   * Pain point reference: receipt fraud / duplicates flagged BEFORE approver
   * sees them (Principle #1 — Evidence-by-default).
   */
  async create(
    input: CreateReceiptDto,
    actor: AuthedUser,
  ): Promise<Receipt & { flags: ReceiptFlag[] }> {
    const expense = await this.prisma.expense.findFirst({
      where: { id: input.expenseId, deletedAt: null },
      include: { trip: true },
    });
    if (!expense) throw new NotFoundException(`Expense ${input.expenseId} not found`);
    if (expense.userId !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the expense owner can attach receipts');
    }

    const bytes = Buffer.from(input.fileBase64, 'base64');
    const contentHash = crypto.createHash('sha256').update(bytes).digest('hex');

    // In production this would store to Azure Blob and return a SAS URL.
    // For v1 dev/test we record a deterministic placeholder URL based on the hash.
    const fileUrl = `placeholder://receipts/${contentHash}`;

    const receipt = await this.prisma.receipt.create({
      data: {
        expenseId: input.expenseId,
        fileUrl,
        contentType: input.contentType,
        contentHash,
        exifTimestamp: input.exifTimestamp ? new Date(input.exifTimestamp) : null,
        exifLat: input.exifLat ?? null,
        exifLng: input.exifLng ?? null,
      },
    });

    // ----- Flag detection -----
    const flags: Prisma.ReceiptFlagCreateManyInput[] = [];

    // 1. Duplicate (exact) hash across all receipts in this project.
    const dups = await this.prisma.receipt.findMany({
      where: {
        contentHash,
        id: { not: receipt.id },
        expense: { projectId: expense.projectId },
      },
      select: { id: true, expense: { select: { id: true, userId: true } } },
    });
    if (dups.length > 0) {
      const sameUser = dups.some((d) => d.expense.userId === expense.userId);
      flags.push({
        receiptId: receipt.id,
        kind: 'DUPLICATE_HASH',
        severity: sameUser ? 'BLOCK' : 'WARN',
        detail: `Identical file already attached to ${dups.length} expense(s). Same submitter: ${sameUser}.`,
      });
    }

    // 2. Date out of trip window (only if expense linked to a trip)
    if (expense.trip && input.exifTimestamp) {
      const ts = new Date(input.exifTimestamp);
      const start = expense.trip.actualStart;
      const end = expense.trip.actualEnd ?? new Date();
      if (ts < start || ts > end) {
        flags.push({
          receiptId: receipt.id,
          kind: 'DATE_OUT_OF_TRIP',
          severity: 'WARN',
          detail: `Receipt EXIF timestamp ${ts.toISOString()} outside trip window ${start.toISOString()}–${end.toISOString()}.`,
        });
      }
    } else if (!input.exifTimestamp) {
      flags.push({
        receiptId: receipt.id,
        kind: 'NO_EXIF',
        severity: 'INFO',
        detail: 'Receipt has no EXIF timestamp. Camera-captured photos should have one.',
      });
    }

    if (flags.length > 0) {
      await this.prisma.receiptFlag.createMany({ data: flags });
    }

    await this.audit.log({
      entity: ENTITY,
      entityId: receipt.id,
      action: 'CREATE',
      actorId: actor.id,
      after: { ...receipt, flags },
    });

    return this.prisma.receipt.findUniqueOrThrow({
      where: { id: receipt.id },
      include: { flags: true },
    });
  }

  async delete(id: string, actor: AuthedUser): Promise<void> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: { expense: true },
    });
    if (!receipt) throw new NotFoundException(`Receipt ${id} not found`);
    if (receipt.expense.userId !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the expense owner can delete a receipt');
    }
    await this.prisma.receipt.delete({ where: { id } });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'DELETE',
      actorId: actor.id,
      before: receipt,
    });
  }
}
