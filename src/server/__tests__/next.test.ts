import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as handlerModule from '../handler.js';
import { createNextHandler } from '../next.js';

const handleSpy = vi.spyOn(handlerModule, 'handleBugReport');

function makeNextRequest(body: unknown, ip = '5.5.5.5') {
  return {
    json: async () => body,
    headers: new Headers({ 'x-forwarded-for': ip }),
  } as unknown as Parameters<ReturnType<typeof createNextHandler>>[0];
}

describe('createNextHandler', () => {
  beforeEach(() => handleSpy.mockReset());

  it('parses JSON body, forwards to handleBugReport, returns NextResponse JSON', async () => {
    handleSpy.mockResolvedValueOnce({ status: 200, body: { ok: true } });
    const POST = createNextHandler({
      sheetId: 's',
      googleCredsJson: '{}',
      blob: { token: 't', prefix: 'p/' },
      appName: 'app',
      rateLimits: { tech: 30, anon: 5 },
      isAuthed: async () => 'u1',
    });
    const res = await POST(makeNextRequest({ source: 'tech', description: 'x' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(handleSpy).toHaveBeenCalled();
  });

  it('returns 400 when body is not JSON', async () => {
    const POST = createNextHandler({
      sheetId: 's', googleCredsJson: '{}', blob: { token: 't', prefix: 'p/' },
      appName: 'app', rateLimits: { tech: 30, anon: 5 }, isAuthed: async () => 'u1',
    });
    const req = { json: async () => { throw new Error('bad json'); }, headers: new Headers() } as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_body' });
  });
});
