import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appendRow, _resetForTests } from '../sheets.js';

const mockAppend = vi.fn();
vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: class {
        constructor(_: unknown) {}
        async getClient() { return {}; }
      },
    },
    sheets: () => ({
      spreadsheets: { values: { append: mockAppend } },
    }),
  },
}));

describe('appendRow', () => {
  beforeEach(() => {
    _resetForTests();
    mockAppend.mockReset();
    process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = '{"type":"service_account"}';
  });

  it('appends a row and returns updatedRows', async () => {
    mockAppend.mockResolvedValueOnce({ data: { updates: { updatedRows: 1 } } });
    const result = await appendRow('sheet-id', 'bug_reports', ['a', 'b']);
    expect(result).toEqual({ updatedRows: 1 });
    expect(mockAppend).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-id',
      range: 'bug_reports!A:Z',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['a', 'b']] },
    });
  });

  it('throws when the API succeeds but updatedRows is 0 (silent drop)', async () => {
    mockAppend.mockResolvedValueOnce({ data: { updates: { updatedRows: 0 } } });
    await expect(appendRow('sheet-id', 'bug_reports', ['x'])).rejects.toThrow(
      /silently dropped/,
    );
  });

  it('wraps upstream errors with a "Sheets append failed" prefix', async () => {
    mockAppend.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    await expect(appendRow('sheet-id', 'bug_reports', ['x'])).rejects.toThrow(
      /Sheets append failed: PERMISSION_DENIED/,
    );
  });

  it('throws when creds env var is unset', async () => {
    delete process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
    await expect(appendRow('sheet-id', 'bug_reports', ['x'])).rejects.toThrow(
      /GOOGLE_SHEETS_CREDENTIALS_JSON/,
    );
  });
});
