import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';

/**
 * Calls `Metatype.validate(value)` if the DTO class exposes one (i.e. it was
 * built with `createZodDto`). Otherwise it's a no-op (lets other pipes/decorators
 * handle the value normally).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const metatype = metadata.metatype as { validate?: (v: unknown) => unknown } | undefined;
    if (metatype && typeof metatype.validate === 'function') {
      return metatype.validate(value);
    }
    return value;
  }
}
