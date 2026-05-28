import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

export const CreateEndCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().min(1).max(80).optional(),
});
export class CreateEndCustomerDto extends createZodDto(CreateEndCustomerSchema) {}
export interface CreateEndCustomerDto extends z.infer<typeof CreateEndCustomerSchema> {}

export const UpdateEndCustomerSchema = CreateEndCustomerSchema.partial().extend({
  active: z.boolean().optional(),
});
export class UpdateEndCustomerDto extends createZodDto(UpdateEndCustomerSchema) {}
export interface UpdateEndCustomerDto extends z.infer<typeof UpdateEndCustomerSchema> {}
