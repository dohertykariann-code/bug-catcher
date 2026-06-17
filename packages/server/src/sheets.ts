import { google } from 'googleapis';

// Lazy-init: tests can stub env per-test without boot-time crashes.
let cachedSheets: ReturnType<typeof google.sheets> | null = null;

function getCreds(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
  if (!raw) throw new Error('GOOGLE_SHEETS_CREDENTIALS_JSON env var is not set');
  try {
    return JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`GOOGLE_SHEETS_CREDENTIALS_JSON is not valid JSON: ${msg}`);
  }
}

async function getSheets() {
  if (cachedSheets) return cachedSheets;
  const auth = new google.auth.GoogleAuth({
    credentials: getCreds(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  cachedSheets = google.sheets({ version: 'v4', auth: client as never });
  return cachedSheets;
}

export function _resetForTests() {
  cachedSheets = null;
}

export async function appendRow(
  sheetId: string,
  tabName: string,
  rowValues: unknown[],
): Promise<{ updatedRows: number }> {
  const sheets = await getSheets();
  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${tabName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    });
    const updatedRows = res.data.updates?.updatedRows ?? 0;
    // 2026-05-28 nail-inspo incident: 5 reports vanished when the API
    // resolved without throwing but updates came back empty. Treat 0 as
    // a failure so handler can fall back to feedback_backup.
    if (updatedRows === 0) {
      throw new Error('Sheets append returned 0 updated rows. Write was silently dropped.');
    }
    return { updatedRows };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('Sheets append failed:') || msg.startsWith('Sheets append returned')) throw err;
    throw new Error(`Sheets append failed: ${msg}`);
  }
}
