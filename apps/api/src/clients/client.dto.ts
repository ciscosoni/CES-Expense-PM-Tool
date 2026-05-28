import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

const ClientKind = z.enum(['SI', 'OEM']);

export const CreateClientSchema = z.object({
  name: z.string().min(1).max(160),
  kind: ClientKind,
});
export class CreateClientDto extends createZodDto(CreateClientSchema) {}
export interface CreateClientDto extends z.infer<typeof CreateClientSchema> {}

export const UpdateClientSchema = CreateClientSchema.partial().extend({
  active: z.boolean().optional(),
});
export class UpdateClientDto extends createZodDto(UpdateClientSchema) {}
export interface UpdateClientDto extends z.infer<typeof UpdateClientSchema> {}
