import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFlushJob } from '../backup.js';
import * as sheetsModule from '../sheets.js';
import type { UnflushedRow } from '../types.js';

const appendSpy = vi.spyOn(sheetsModule, 'appendRow');

const sampleRow: UnflushedRow = {
  id: 'row-1',
  timestamp: '2026-06-16T12:00:00.000Z',
  app_name: 'psba-admin',
  source: 'tech',
  user_id: 'u1',
  client_slug: '',
  url_path: '/admin/calls',
  description: 'oops',
  screenshot_url: '',
  user_agent: 'Mozilla/5.0',
};

describe('createFlushJob', () => {
  beforeEach(() => appendSpy.mockReset());

  it('dry-run: lists rows, does not append, does not mark', async () => {
    const selectUnflushed = vi.fn().mockResolvedValueOnce([sampleRow]);
    const markFlushed = vi.fn();
    const flush = createFlushJob({
      selectUnflushed,
      markFlushed,
      sheetId: 's',
      sheetName: 'bug_reports',
    });
    const result = await flush({ dryRun: true });
    expect(result).toEqual({ ok: 0, fail: 0 });
    expect(appendSpy).not.toHaveBeenCalled();
    expect(markFlushed).not.toHaveBeenCalled();
  });

  it('happy path: appends each row, marks each id', async () => {
    appendSpy.mockResolvedValue({ updatedRows: 1 });
    const markFlushed = vi.fn().mockResolvedValue(undefined);
    const flush = createFlushJob({
      selectUnflushed: async () => [sampleRow, { ...sampleRow, id: 'row-2' }],
      markFlushed,
      sheetId: 's',
      sheetName: 'bug_reports',
    });
    const result = await flush({ dryRun: false });
    expect(result).toEqual({ ok: 2, fail: 0 });
    expect(appendSpy).toHaveBeenCalledTimes(2);
    expect(markFlushed).toHaveBeenCalledWith('row-1');
    expect(markFlushed).toHaveBeenCalledWith('row-2');
  });

  it('partial failure: row 1 succeeds, row 2 fails, only row 1 marked', async () => {
    appendSpy
      .mockResolvedValueOnce({ updatedRows: 1 })
      .mockRejectedValueOnce(new Error('Sheets append failed: 503'));
    const markFlushed = vi.fn().mockResolvedValue(undefined);
    const flush = createFlushJob({
      selectUnflushed: async () => [sampleRow, { ...sampleRow, id: 'row-2' }],
      markFlushed,
      sheetId: 's',
      sheetName: 'bug_reports',
    });
    const result = await flush({ dryRun: false });
    expect(result).toEqual({ ok: 1, fail: 1 });
    expect(markFlushed).toHaveBeenCalledTimes(1);
    expect(markFlushed).toHaveBeenCalledWith('row-1');
  });
});
