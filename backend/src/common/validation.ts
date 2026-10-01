import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

export interface FieldError {
  field: string;
  messages: string[];
}

function flatten(errors: ValidationError[], prefix = ''): FieldError[] {
  return errors.flatMap((e) => {
    const field = prefix ? `${prefix}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, messages: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Some fields are invalid.',
    details: flatten(errors),
  });
}
