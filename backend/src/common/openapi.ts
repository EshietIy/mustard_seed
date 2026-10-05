import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * This API has no fractional numbers: money is whole kobo and everything else is a count or
 * an order (AGENT.md section 8). Nest's generator types TypeScript `number` as "number", so the
 * published spec says "integer" instead, which is what generated clients (the Android app)
 * need.
 */
export function wholeNumbersAsIntegers(document: OpenAPIObject): OpenAPIObject {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record.type === 'number') record.type = 'integer';
    Object.values(record).forEach(visit);
  };
  visit(document);
  return document;
}
