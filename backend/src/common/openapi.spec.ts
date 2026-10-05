import type { OpenAPIObject } from '@nestjs/swagger';
import { wholeNumbersAsIntegers } from './openapi';

describe('wholeNumbersAsIntegers', () => {
  it('marks every number in schemas and parameters as an integer', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/x': {
          get: {
            parameters: [{ name: 'n', in: 'query', schema: { type: 'number' } }],
            responses: {},
          },
        },
      },
      components: {
        schemas: {
          A: {
            type: 'object',
            properties: {
              kobo: { type: 'number', nullable: true },
              list: { type: 'array', items: { type: 'number' } },
              name: { type: 'string' },
            },
          },
        },
      },
    } as unknown as OpenAPIObject;
    const out = wholeNumbersAsIntegers(doc);
    const a = out.components?.schemas?.A as {
      properties: Record<string, { type: string; items?: { type: string } }>;
    };
    expect(a.properties.kobo.type).toBe('integer');
    expect(a.properties.list.items?.type).toBe('integer');
    expect(a.properties.name.type).toBe('string');
    expect(JSON.stringify(out)).not.toContain('"number"');
  });
});
