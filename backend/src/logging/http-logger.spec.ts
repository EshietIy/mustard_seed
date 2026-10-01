import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import pino from 'pino';
import request from 'supertest';
import { createHttpLogger } from './http-logger';

function setup() {
  const lines: Record<string, unknown>[] = [];
  const logger = pino(
    { level: 'info' },
    { write: (s: string) => lines.push(JSON.parse(s) as Record<string, unknown>) },
  );
  const httpLogger = createHttpLogger(logger);
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    httpLogger(req, res);
    res.statusCode = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('status') ?? 200);
    res.end('{}');
  });
  return { lines, server };
}

const wait = () => new Promise((r) => setTimeout(r, 20));

describe('createHttpLogger', () => {
  it.each([
    [200, 30, 'SUCCESS'],
    [302, 30, 'SUCCESS'],
    [404, 40, 'FAILED'],
    [429, 40, 'FAILED'],
    [500, 50, 'FAILED'],
    [503, 50, 'FAILED'],
  ])('logs status %i at level %i with outcome %s', async (status, level, outcome) => {
    const { lines, server } = setup();
    await request(server).get(`/thing?status=${status}`);
    await wait();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level, outcome, statusCode: status });
    expect(typeof lines[0].responseTime).toBe('number');
  });

  it('sets and logs a request id, and logs only method/url/id of the request', async () => {
    const { lines, server } = setup();
    const res = await request(server)
      .get('/thing')
      .set('Authorization', 'Bearer abc')
      .set('Cookie', 'session=xyz');
    await wait();
    const id = res.headers['x-request-id'];
    expect(id).toEqual(expect.any(String));
    expect(lines[0].req).toEqual({ id, method: 'GET', url: '/thing' });
    expect(JSON.stringify(lines)).not.toMatch(/abc|xyz/);
  });

  it('reuses a valid incoming request id', async () => {
    const { lines, server } = setup();
    const id = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
    const res = await request(server).get('/thing').set('X-Request-Id', id);
    await wait();
    expect(res.headers['x-request-id']).toBe(id);
    expect((lines[0].req as { id: string }).id).toBe(id);
  });
});
