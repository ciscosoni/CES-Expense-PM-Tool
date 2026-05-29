import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

const AttendanceEventKind = z.enum([
  'CHECK_IN',
  'CHECK_OUT',
  'GEOFENCE_ENTER',
  'GEOFENCE_EXIT',
  'MANUAL_ENTRY',
]);

const AttendanceEventSource = z.enum(['MOBILE', 'WEB', 'MANUAL', 'SYSTEM']);

export const CreateAttendanceEventSchema = z.object({
  /** ISO timestamp. */
  occurredAt: z.string().datetime({ offset: true }),
  kind: AttendanceEventKind,
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  accuracyMeters: z.number().int().nonnegative().nullable().default(null),
  projectSiteId: z.string().uuid().nullable().default(null),
  source: AttendanceEventSource.default('MOBILE'),
});
export class CreateAttendanceEventDto extends createZodDto(CreateAttendanceEventSchema) {}
export interface CreateAttendanceEventDto extends z.infer<typeof CreateAttendanceEventSchema> {}

export const CreateRegularizationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  reason: z.enum([
    'REMOTE_WORK',
    'MISSED_PUNCH',
    'SITE_VISIT_NOT_GEOFENCED',
    'SICK',
    'PERSONAL',
    'OTHER',
  ]),
  notes: z.string().min(1, 'Justification is required').max(500),
  projectId: z.string().uuid().nullable().default(null),
});
export class CreateRegularizationDto extends createZodDto(CreateRegularizationSchema) {}
export interface CreateRegularizationDto extends z.infer<typeof CreateRegularizationSchema> {}

export const RejectRegularizationSchema = z.object({
  reason: z.string().min(1, 'Reject reason is required').max(500),
});
export class RejectRegularizationDto extends createZodDto(RejectRegularizationSchema) {}
export interface RejectRegularizationDto extends z.infer<typeof RejectRegularizationSchema> {}
