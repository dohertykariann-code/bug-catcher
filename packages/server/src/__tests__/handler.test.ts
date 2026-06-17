import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as sheetsModule from '../sheets.js';
import * as blobModule from '../blob.js';
import { handleBugReport } from '../handler.js';
import type { BugCatcherDeps } from '../handler.js';

const appendSpy = vi.spyOn(sheetsModule, 'appendRow');
const uploadSpy = vi.spyOn(blobModule, 'uploadScreenshot');

function makeDeps(overrides: Partial<BugCatcherDeps> = {}): BugCatcherDeps {
  return {
    sheetId: 'sheet-id',
    googleCredsJson: '{"type":"service_account"}',
    blob: { token: 'blob-tok', prefix: 'bug-reports/' },
    appName: 'test-app',
    rateLimits: { tech: 30, anon: 5 },
    isAuthed: async () => 'user-1',
    validateSlug: undefined,
    backup: undefined,
    ipFor: () => '1.1.1.1',
    now: () => new Date('2026-06-16T12:00:00.000Z'),
    ...overrides,
  };
}

describe('handleBugReport', () => {
  beforeEach(() => {
    appendSpy.mockReset();
    uploadSpy.mockReset();
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = '{"type":"service_account"}';
  });

  it('200 on happy path (tech source, no screenshot)', async () => {
    appendSpy.mockResolvedValueOnce({ updatedRows: 1 });
    const res = await handleBugReport(makeDeps(), {
      body: { source: 'tech', description: 'thing broke' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(appendSpy).toHaveBeenCalledTimes(1);
  });

  it('200 with backed_up: Sheet fails, backup succeeds', async () => {
    appendSpy.mockRejectedValueOnce(new Error('Sheets append failed: 503'));
    const insert = vi.fn().mockResolvedValue(undefined);
    const res = await handleBugReport(
      makeDeps({ backup: { insert } }),
      { body: { source: 'tech', description: 'x' } },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, backed_up: true });
    expect(insert).toHaveBeenCalled();
  });

  it('200 replayed: backup insert hits unique violation (PG 23505)', async () => {
    appendSpy.mockRejectedValueOnce(new Error('Sheets append failed: 503'));
    const insert = vi.fn().mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await handleBugReport(
      makeDeps({ backup: { insert } }),
      { body: { source: 'tech', description: 'x', idempotency_key: '00000000-0000-4000-8000-000000000000' } },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, backed_up: true, replayed: true });
  });

  it('400 invalid_body on Zod failure', async () => {
    const res = await handleBugReport(makeDeps(), { body: { source: 'bogus' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_body' });
  });

  it('400 invalid_body when client slug fails validateSlug', async () => {
    const res = await handleBugReport(
      makeDeps({ validateSlug: async () => false }),
      { body: { source: 'client', client_slug: 'nope', description: 'x' } },
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_body' });
  });

  it('400 empty_submission when description and screenshot are both blank', async () => {
    const res = await handleBugReport(makeDeps(), { body: { source: 'tech' } });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'empty_submission' });
  });

  it('401 unauthorized when source=tech and isAuthed returns null', async () => {
    const res = await handleBugReport(
      makeDeps({ isAuthed: async () => null }),
      { body: { source: 'tech', description: 'x' } },
    );
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('429 rate_limited after N requests from same IP', async () => {
    appendSpy.mockResolvedValue({ updatedRows: 1 });
    const deps = makeDeps({ rateLimits: { tech: 2, anon: 1 } });
    await handleBugReport(deps, { body: { source: 'tech', description: '1' } });
    await handleBugReport(deps, { body: { source: 'tech', description: '2' } });
    const res = await handleBugReport(deps, { body: { source: 'tech', description: '3' } });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limited' });
  });

  it('500 sheets_write_failed when Sheet fails AND no backup configured', async () => {
    appendSpy.mockRejectedValueOnce(new Error('Sheets append failed: 503'));
    const res = await handleBugReport(makeDeps(), { body: { source: 'tech', description: 'x' } });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'sheets_write_failed' });
  });

  it('503 feedback_not_configured when sheetId env is unset', async () => {
    const res = await handleBugReport(
      makeDeps({ sheetId: '' }),
      { body: { source: 'tech', description: 'x' } },
    );
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'feedback_not_configured' });
  });

  it('screenshot upload failure does not block the row write', async () => {
    appendSpy.mockResolvedValueOnce({ updatedRows: 1 });
    uploadSpy.mockRejectedValueOnce(new Error('blob 503'));
    const res = await handleBugReport(makeDeps(), {
      body: {
        source: 'tech',
        description: 'x',
        screenshot_base64: 'AAA',
        screenshot_mime: 'image/png',
      },
    });
    expect(res.status).toBe(200);
    const args = appendSpy.mock.calls[0]![2] as unknown[];
    expect(args[7]).toBe(''); // screenshot_url column is empty
  });
});
