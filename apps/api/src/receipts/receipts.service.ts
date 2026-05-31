import * as crypto from 'node:crypto';
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type Receipt, type ReceiptFlag } from '@prisma/client';
import sharp from 'sharp';
import exifr from 'exifr';
import { dHashFromGray, distanceToNearestSite, hammingDistance } from '@ces/evidence';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { AuthedUser } from '../auth/index.js';
import type { CreateReceiptDto } from './receipt.dto.js';
import { createOcrProvider, type OcrProvider } from './ocr/index.js';

const ENTITY = 'Receipt';

// Tunable thresholds (admin-policy candidates later; env-overridable now).
const PHASH_NEAR_DUP_BITS = Number(process.env.RECEIPT_PHASH_BITS ?? 10);
const GPS_FAR_METERS = Number(process.env.RECEIPT_GPS_FAR_METERS ?? 2000);
const AMOUNT_TOLERANCE = Number(process.env.RECEIPT_AMOUNT_TOLERANCE_PCT ?? 5) / 100;

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);
  private readonly ocr: OcrProvider = createOcrProvider(process.env);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async listForExpense(expenseId: string) {
    return this.prisma.receipt.findMany({
      where: { expenseId },
      include: { flags: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Accept a receipt upload and derive the evidence layer at submission time
   * (Principle #1 — evidence-by-default): store the file, hash it (SHA-256 +
   * perceptual), read EXIF (timestamp + GPS) from the bytes, OCR the amount,
   * then flag duplicates / out-of-trip dates / out-of-geofence GPS / amount
   * mismatches BEFORE any approver sees it.
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

    // Evidence derivation (all best-effort; failures degrade gracefully).
    const perceptualHash = await this.computePerceptualHash(bytes);
    const exif = await this.extractExif(bytes);
    const ocr = await this.runOcr(bytes, input.contentType);

    // Server-extracted EXIF wins; fall back to client-supplied values (mobile).
    const exifTimestamp =
      exif.timestamp ?? (input.exifTimestamp ? new Date(input.exifTimestamp) : null);
    const exifLat = exif.lat ?? input.exifLat ?? null;
    const exifLng = exif.lng ?? input.exifLng ?? null;
    const ocrAmount = ocr?.parsed.amount ? new Prisma.Decimal(ocr.parsed.amount) : null;

    const stored = await this.storage.putReceipt(contentHash, bytes, input.contentType);

    const receipt = await this.prisma.receipt.create({
      data: {
        expenseId: input.expenseId,
        fileUrl: stored.url,
        contentType: input.contentType,
        contentHash,
        perceptualHash,
        exifTimestamp,
        exifLat,
        exifLng,
        ocrJson: ocr ? (ocr as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        ocrAmount,
      },
    });

    const flags = await this.detectFlags({
      receiptId: receipt.id,
      expense,
      contentHash,
      perceptualHash,
      exifTimestamp,
      exifLat: exifLat ? Number(exifLat) : null,
      exifLng: exifLng ? Number(exifLng) : null,
      ocrAmount,
    });
    if (flags.length > 0) await this.prisma.receiptFlag.createMany({ data: flags });

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

  /**
   * Analyze a snapped receipt and return prefill suggestions for a new expense
   * (amount, date, category, vendor) + a matched trip — so the engineer confirms
   * instead of typing. No expense is created here.
   */
  async analyze(input: { fileBase64: string; contentType: string }, actor: AuthedUser) {
    const bytes = Buffer.from(input.fileBase64, 'base64');
    const exif = await this.extractExif(bytes);
    const ocr = await this.runOcr(bytes, input.contentType);

    const isoDate =
      (exif.timestamp ? exif.timestamp.toISOString().slice(0, 10) : null) ??
      ocr?.parsed.date ??
      null;
    const category = guessCategory(ocr?.parsed.vendor);

    // Match a trip of this user whose window contains the receipt date.
    let trip: { id: string; projectId: string } | null = null;
    if (isoDate) {
      const d = new Date(isoDate);
      const found = await this.prisma.trip.findFirst({
        where: {
          travelRequest: { userId: actor.id },
          actualStart: { lte: d },
          OR: [{ actualEnd: null }, { actualEnd: { gte: d } }],
        },
        select: { id: true, travelRequest: { select: { projectId: true } } },
        orderBy: { actualStart: 'desc' },
      });
      if (found) trip = { id: found.id, projectId: found.travelRequest.projectId };
    }

    return {
      ocr: ocr ? { source: ocr.source, ...ocr.parsed } : null,
      exif: {
        timestamp: exif.timestamp?.toISOString() ?? null,
        lat: exif.lat,
        lng: exif.lng,
      },
      suggestion: {
        amount: ocr?.parsed.amount ?? null,
        currency: ocr?.parsed.currency ?? 'INR',
        incurredOn: isoDate,
        category,
        notes: ocr?.parsed.vendor ?? null,
        tripId: trip?.id ?? null,
        projectId: trip?.projectId ?? null,
      },
    };
  }

  // ---------- evidence derivation ----------

  private async computePerceptualHash(bytes: Buffer): Promise<string | null> {
    try {
      const raw = await sharp(bytes).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
      return dHashFromGray(raw, 9, 8);
    } catch {
      // Non-raster (PDF) or undecodable — skip the perceptual hash.
      return null;
    }
  }

  private async extractExif(
    bytes: Buffer,
  ): Promise<{ timestamp: Date | null; lat: number | null; lng: number | null }> {
    try {
      const data = await exifr.parse(bytes, { gps: true, pick: ['DateTimeOriginal', 'CreateDate'] });
      const ts = (data?.DateTimeOriginal ?? data?.CreateDate) as Date | undefined;
      const lat = typeof data?.latitude === 'number' ? data.latitude : null;
      const lng = typeof data?.longitude === 'number' ? data.longitude : null;
      return { timestamp: ts instanceof Date ? ts : null, lat, lng };
    } catch {
      return { timestamp: null, lat: null, lng: null };
    }
  }

  private async runOcr(bytes: Buffer, contentType: string) {
    try {
      return await this.ocr.extract(bytes, contentType);
    } catch (err) {
      this.logger.warn(`OCR (${this.ocr.kind}) failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  // ---------- flag detection ----------

  private async detectFlags(ctx: {
    receiptId: string;
    expense: { id: string; userId: string; projectId: string; amount: Prisma.Decimal; trip: { actualStart: Date; actualEnd: Date | null } | null };
    contentHash: string;
    perceptualHash: string | null;
    exifTimestamp: Date | null;
    exifLat: number | null;
    exifLng: number | null;
    ocrAmount: Prisma.Decimal | null;
  }): Promise<Prisma.ReceiptFlagCreateManyInput[]> {
    const flags: Prisma.ReceiptFlagCreateManyInput[] = [];
    const { expense } = ctx;

    // 1a. Exact duplicate (SHA-256) within the project.
    const exactDups = await this.prisma.receipt.findMany({
      where: {
        contentHash: ctx.contentHash,
        id: { not: ctx.receiptId },
        expense: { projectId: expense.projectId },
      },
      select: { id: true, expense: { select: { userId: true } } },
    });
    if (exactDups.length > 0) {
      const sameUser = exactDups.some((d) => d.expense.userId === expense.userId);
      flags.push({
        receiptId: ctx.receiptId,
        kind: 'DUPLICATE_HASH',
        severity: sameUser ? 'BLOCK' : 'WARN',
        detail: `Identical file already attached to ${exactDups.length} expense(s). Same submitter: ${sameUser}.`,
      });
    } else if (ctx.perceptualHash) {
      // 1b. Near-duplicate (perceptual) — same receipt re-photographed.
      const candidates = await this.prisma.receipt.findMany({
        where: {
          id: { not: ctx.receiptId },
          perceptualHash: { not: null },
          expense: { projectId: expense.projectId },
        },
        select: { perceptualHash: true, expense: { select: { userId: true } } },
        take: 500,
      });
      const near = candidates.find(
        (c) =>
          c.perceptualHash &&
          c.perceptualHash.length === ctx.perceptualHash!.length &&
          hammingDistance(c.perceptualHash, ctx.perceptualHash!) <= PHASH_NEAR_DUP_BITS,
      );
      if (near) {
        const sameUser = near.expense.userId === expense.userId;
        flags.push({
          receiptId: ctx.receiptId,
          kind: 'DUPLICATE_HASH',
          severity: sameUser ? 'WARN' : 'INFO',
          detail: `Perceptually similar to an existing receipt (re-photographed?). Same submitter: ${sameUser}.`,
        });
      }
    }

    // 2. Date vs trip window / missing EXIF.
    if (ctx.exifTimestamp && expense.trip) {
      const start = expense.trip.actualStart;
      const end = expense.trip.actualEnd ?? new Date();
      if (ctx.exifTimestamp < start || ctx.exifTimestamp > end) {
        flags.push({
          receiptId: ctx.receiptId,
          kind: 'DATE_OUT_OF_TRIP',
          severity: 'WARN',
          detail: `Receipt timestamp ${ctx.exifTimestamp.toISOString()} outside trip window ${start.toISOString()}–${end.toISOString()}.`,
        });
      }
    } else if (!ctx.exifTimestamp) {
      flags.push({
        receiptId: ctx.receiptId,
        kind: 'NO_EXIF',
        severity: 'INFO',
        detail: 'No EXIF timestamp — camera-captured photos normally have one.',
      });
    }

    // 3. GPS far from any project site geofence.
    if (ctx.exifLat != null && ctx.exifLng != null) {
      const fences = await this.prisma.geofence.findMany({
        where: { projectSite: { projectId: expense.projectId } },
        select: { centerLat: true, centerLng: true, radiusMeters: true },
      });
      if (fences.length > 0) {
        const { insideAny, nearestEdgeMeters } = distanceToNearestSite(
          ctx.exifLat,
          ctx.exifLng,
          fences.map((f) => ({
            lat: Number(f.centerLat),
            lng: Number(f.centerLng),
            radiusMeters: f.radiusMeters,
          })),
        );
        if (!insideAny && nearestEdgeMeters != null && nearestEdgeMeters > GPS_FAR_METERS) {
          flags.push({
            receiptId: ctx.receiptId,
            kind: 'GPS_FAR_FROM_TRIP',
            severity: 'WARN',
            detail: `Receipt GPS is ~${Math.round(nearestEdgeMeters)}m from the nearest project site (threshold ${GPS_FAR_METERS}m).`,
          });
        }
      }
    }

    // 4. Entered amount exceeds OCR'd amount beyond tolerance.
    if (ctx.ocrAmount) {
      const entered = Number(expense.amount);
      const ocr = Number(ctx.ocrAmount);
      if (ocr > 0 && entered > ocr * (1 + AMOUNT_TOLERANCE)) {
        flags.push({
          receiptId: ctx.receiptId,
          kind: 'AMOUNT_OCR_MISMATCH',
          severity: 'WARN',
          detail: `Entered amount ${entered} exceeds OCR-detected ${ocr} by more than ${AMOUNT_TOLERANCE * 100}%.`,
        });
      }
    }

    return flags;
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

/** Heuristic expense-category guess from the OCR'd vendor name. */
function guessCategory(vendor: string | undefined): string {
  const v = (vendor ?? '').toLowerCase();
  if (/hotel|inn|resort|stay|lodge|oyo|marriott|taj|hyatt/.test(v)) return 'LODGING';
  if (/uber|ola|taxi|cab|auto|rapido|metro|toll|parking|fuel|petrol/.test(v))
    return 'LOCAL_CONVEYANCE';
  if (/air|flight|indigo|vistara|spicejet|airlines|irctc|railway|train/.test(v)) return 'TRAVEL';
  if (/restaurant|cafe|food|kitchen|dhaba|bar|grill|pizza|coffee|swiggy|zomato/.test(v))
    return 'MEALS';
  if (/airtel|jio|vodafone|telecom|internet|broadband/.test(v)) return 'COMMUNICATION';
  return 'OTHER';
}
