#!/usr/bin/env node
/**
 * @kari/bug-catcher validate-install
 *
 * Pre-flight validator. Checks every env var and external dependency
 * that a bug-catcher install requires BEFORE you submit a real bug report.
 *
 * Usage:
 *   npm run bug-catcher:validate
 *   node node_modules/@kari/bug-catcher/scripts/validate-install.mjs
 *
 * Reads from .env (via dotenv, if installed), then process.env.
 */

import { createRequire } from 'module';
import { resolve } from 'path';

const require = createRequire(import.meta.url);

// --- dotenv: load .env if available, but don't crash if it isn't ---
try {
  const dotenvPath = resolve(process.cwd(), 'node_modules', 'dotenv', 'config.js');
  await import(dotenvPath);
} catch {
  // dotenv not installed or .env doesn't exist; continue with process.env only
}

const EXPECTED_HEADER = [
  'timestamp',
  'app_name',
  'source',
  'user_id',
  'client_slug',
  'url_path',
  'description',
  'screenshot_url',
  'user_agent',
];

const TAB_NAME = 'bug_reports';
const SHEET_ID_LENGTH = 44;
const BLOB_PREFIX = 'vercel_blob_rw_';

let allPass = true;

function pass(msg) {
  process.stdout.write(`\x1b[32m✓\x1b[0m ${msg}\n`);
}

function fail(msg, fix) {
  allPass = false;
  process.stdout.write(`\x1b[31m✗\x1b[0m ${msg}\n`);
  if (fix) process.stdout.write(`  Fix: ${fix}\n`);
}

function warn(msg) {
  process.stdout.write(`\x1b[33m!\x1b[0m ${msg}\n`);
}

process.stdout.write('[bug-catcher validate]\n\n');

// --- 1. BUG_CATCHER_SHEET_ID ---
const sheetId = process.env.BUG_CATCHER_SHEET_ID ?? '';
if (!sheetId) {
  fail(
    'BUG_CATCHER_SHEET_ID missing',
    'Add BUG_CATCHER_SHEET_ID to .env (local) and Vercel env vars (Production scope). Value is the string between /d/ and /edit in your Sheet URL.',
  );
} else if (sheetId.startsWith('http')) {
  fail(
    `BUG_CATCHER_SHEET_ID looks like a URL (starts with "http")`,
    'You pasted the Sheet URL instead of the Sheet ID. Copy only the 44-character string between /d/ and /edit in the URL.',
  );
} else if (sheetId.length !== SHEET_ID_LENGTH) {
  fail(
    `BUG_CATCHER_SHEET_ID present but unexpected length (${sheetId.length} chars, expected ${SHEET_ID_LENGTH})`,
    'Sheet IDs are exactly 44 characters. Re-copy from the Sheet URL: the segment between /spreadsheets/d/ and /edit.',
  );
} else {
  pass(`BUG_CATCHER_SHEET_ID present (${sheetId.length} chars)`);
}

// --- 2. GOOGLE_SHEETS_CREDENTIALS_JSON ---
const credsRaw = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON ?? '';
let creds = null;
let serviceAccountEmail = '';

if (!credsRaw) {
  fail(
    'GOOGLE_SHEETS_CREDENTIALS_JSON missing',
    'Add the full service account JSON to .env (local) and Vercel env vars (Production scope). Download from GCP > IAM > Service Accounts > Keys.',
  );
} else if (credsRaw.startsWith('http')) {
  fail(
    'GOOGLE_SHEETS_CREDENTIALS_JSON looks like a URL (starts with "http")',
    'You pasted a URL instead of the JSON content. Open your password manager or GCP service account key file, copy the full JSON object, and paste that.',
  );
} else {
  try {
    creds = JSON.parse(credsRaw);
    serviceAccountEmail = creds.client_email ?? '';
    if (!serviceAccountEmail) {
      fail(
        'GOOGLE_SHEETS_CREDENTIALS_JSON parsed but missing client_email field',
        'This does not look like a GCP service account key. Download the key as JSON from GCP > IAM > Service Accounts > [your account] > Keys > Add Key.',
      );
    } else {
      pass(`GOOGLE_SHEETS_CREDENTIALS_JSON valid JSON (service account: ${serviceAccountEmail})`);
    }
  } catch (e) {
    fail(
      `GOOGLE_SHEETS_CREDENTIALS_JSON malformed: ${e instanceof Error ? e.message : String(e)}`,
      'The value is not valid JSON. Common causes: (a) pasted with extra wrapper quotes, (b) truncated during copy. Re-paste the full JSON from your service account key file.',
    );
  }
}

// --- 3. BLOB_READ_WRITE_TOKEN ---
const blobToken = process.env.BLOB_READ_WRITE_TOKEN ?? '';
if (!blobToken) {
  fail(
    'BLOB_READ_WRITE_TOKEN missing or empty',
    'Even if "Vercel Blob" shows as Connected in the Vercel dashboard, the token may not have been auto-populated. Go to Vercel project > Settings > Environment Variables and copy the BLOB_READ_WRITE_TOKEN value manually.',
  );
} else if (!blobToken.startsWith(BLOB_PREFIX)) {
  fail(
    `BLOB_READ_WRITE_TOKEN present but unexpected shape (expected to start with "${BLOB_PREFIX}")`,
    `Vercel Blob tokens begin with "${BLOB_PREFIX}". Re-copy from Vercel project > Settings > Environment Variables.`,
  );
} else {
  pass(`BLOB_READ_WRITE_TOKEN present (${BLOB_PREFIX} shape confirmed)`);
}

// --- 4. Google Sheets API checks ---
process.stdout.write('\n');
if (sheetId && sheetId.length === SHEET_ID_LENGTH && !sheetId.startsWith('http') && creds && serviceAccountEmail) {
  let sheetsClient = null;
  try {
    // Dynamic import so consumers without googleapis don't crash at parse time.
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    sheetsClient = google.sheets({ version: 'v4', auth: authClient });
  } catch (e) {
    fail(
      `Failed to initialize Google Sheets client: ${e instanceof Error ? e.message : String(e)}`,
      'Ensure googleapis is installed as a dependency of this package (it is; if missing, run npm install in the bug-catcher repo).',
    );
  }

  if (sheetsClient) {
    // 4a. Sheet exists and is accessible
    let sheetTitle = '';
    let tabs = [];
    try {
      const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: sheetId });
      sheetTitle = meta.data.properties?.title ?? '(no title)';
      tabs = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? '');
      pass(`Sheet accessible (title: "${sheetTitle}")`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('does not have permission') || msg.includes('caller does not have permission')) {
        fail(
          `Sheet access denied: ${msg}`,
          `Share the Sheet with the service account email "${serviceAccountEmail}" as Editor. In Google Sheets: Share > paste email > Editor > uncheck "Notify people" > Share.`,
        );
      } else if (msg.includes('not found') || msg.includes('Requested entity was not found')) {
        fail(
          `Sheet not found: ${msg}`,
          `The BUG_CATCHER_SHEET_ID value does not match any Sheet this service account can see. Verify: (1) Sheet ID is correct (44-char string from URL), (2) Sheet is shared with "${serviceAccountEmail}".`,
        );
      } else {
        fail(`Sheet API error: ${msg}`, 'Check BUG_CATCHER_SHEET_ID and GOOGLE_SHEETS_CREDENTIALS_JSON values.');
      }
    }

    // 4b. bug_reports tab exists
    if (tabs.length > 0) {
      if (tabs.includes(TAB_NAME)) {
        pass(`"${TAB_NAME}" tab exists`);
      } else {
        fail(
          `Tab "${TAB_NAME}" not found (found: ${tabs.join(', ')})`,
          `Rename the first tab to exactly "${TAB_NAME}" (no spaces, no capitals). The handler hardcodes this name.`,
        );
      }
    }

    // 4c. Header row matches expected columns
    if (tabs.includes(TAB_NAME)) {
      try {
        const rowRes = await sheetsClient.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `${TAB_NAME}!A1:I1`,
        });
        const headerRow = (rowRes.data.values?.[0] ?? []).map((v) => String(v).trim());
        const matches = EXPECTED_HEADER.every((col, i) => headerRow[i] === col);
        if (matches && headerRow.length === EXPECTED_HEADER.length) {
          pass(`Header row matches expected 9 columns`);
        } else if (headerRow.length === 0) {
          fail(
            'Header row is empty',
            `Paste this tab-separated header into cell A1 of the "${TAB_NAME}" tab:\n  ${EXPECTED_HEADER.join('\t')}`,
          );
        } else {
          const mismatches = EXPECTED_HEADER.map((expected, i) => {
            const actual = headerRow[i] ?? '(missing)';
            return actual !== expected ? `col ${i + 1}: expected "${expected}", got "${actual}"` : null;
          }).filter(Boolean);
          fail(
            `Header row mismatch: ${mismatches.join('; ')}`,
            `Replace A1:I1 with exactly:\n  ${EXPECTED_HEADER.join('\t')}\n  (tab-separated, 9 columns, no extras)`,
          );
        }
      } catch (e) {
        fail(
          `Could not read header row: ${e instanceof Error ? e.message : String(e)}`,
          'Check sheet permissions and that the tab name is exactly "bug_reports".',
        );
      }
    }
  }
} else {
  warn('Skipping Sheets API checks (env vars above must pass first).');
}

// --- 5. Vercel Blob smoke test ---
process.stdout.write('\n');
if (blobToken && blobToken.startsWith(BLOB_PREFIX)) {
  try {
    const { put, del } = await import('@vercel/blob');
    const testPathname = `bug-catcher-validate-${Date.now()}.txt`;
    const result = await put(testPathname, Buffer.from('bug-catcher validate smoke test'), {
      access: 'public',
      token: blobToken,
      contentType: 'text/plain',
    });
    // Delete immediately so we don't leave test blobs lying around.
    await del(result.url, { token: blobToken });
    pass('Blob upload smoke test passed');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unauthorized') || msg.includes('Unauthorized') || msg.includes('401')) {
      fail(
        `Blob token rejected (401 Unauthorized): ${msg}`,
        'BLOB_READ_WRITE_TOKEN is invalid or expired. Go to Vercel > project > Settings > Environment Variables and copy the current token.',
      );
    } else {
      fail(
        `Blob smoke test failed: ${msg}`,
        'Check that @vercel/blob is installed and BLOB_READ_WRITE_TOKEN is the read-write token (not a read-only token).',
      );
    }
  }
} else {
  warn('Skipping Blob smoke test (BLOB_READ_WRITE_TOKEN must pass first).');
}

// --- Final result ---
process.stdout.write('\n');
if (allPass) {
  process.stdout.write(
    '\x1b[32mREADY:\x1b[0m bug-catcher install verified. Submit a real test report from your app to confirm end-to-end.\n',
  );
  process.exit(0);
} else {
  process.stdout.write(
    '\x1b[31mNOT READY:\x1b[0m Fix the items above and re-run: npm run bug-catcher:validate\n',
  );
  process.exit(1);
}
