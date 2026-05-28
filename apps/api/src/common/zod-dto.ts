import { BadRequestException } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Turns a Zod schema into a NestJS-compatible DTO class. The ZodValidationPipe
 * calls the static `validate` method on the metatype to coerce + check the body.
 *
 * The cast at the end gives DTO *instances* the schema's inferred type, so
 * controller method bodies can read input fields with full type safety:
 *
 *   const CreateFooSchema = z.object({ name: z.string() });
 *   export class CreateFooDto extends createZodDto(CreateFooSchema) {}
 *
 *   @Post() create(@Body() body: CreateFooDto) {
 *     body.name; // typed as string
 *   }
 */
export function createZodDto<T extends ZodSchema>(schema: T) {
  class ZodDto {
    static schema = schema;
    static validate(value: unknown): T['_output'] {
      const result = schema.safeParse(value);
      if (!result.success) {
        throw new BadRequestException({
          message: 'Validation failed',
          issues: result.error.issues.map((i) => ({
            path: i.path.join('.') || '(root)',
            message: i.message,
            code: i.code,
          })),
        });
      }
      return result.data;
    }
  }
  return ZodDto;
}
