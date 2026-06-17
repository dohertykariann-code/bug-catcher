# Installing @kari/bug-catcher in a new consumer app

This runbook captures every lesson from the 2026-06-17 PSBA install. Follow it top to bottom and you will not hit any of those same walls.

## Prerequisites

- **bug-catcher must be a public GitHub repo**, OR you must wire Vercel GitHub auth for your account. The repo was created `--private` and Vercel failed with `Permission denied (publickey)` because it had no SSH key for a private repo. Making it public (or configuring GitHub auth in your Vercel account) fixes this permanently.
- Consumer app has `@vercel/blob` installed (already a dep of most Next.js apps; run `npm install @vercel/blob` if not).
- Consumer app uses Postgres and has Drizzle or Prisma set up for migrations (or raw SQL access via `psql`).
- Node >= 20.

---

## Step 1: Add the dependency

In your consumer app's `package.json`:

```json
"dependencies": {
  "@kari/bug-catcher": "git+https://github.com/dohertykariann-code/bug-catcher.git#v0.1.2"
}
```

Then install:

```bash
npm install
```

> **Why HTTPS not SSH?** SSH (`git+ssh://`) requires a key pair in every CI/deploy environment. HTTPS works with a public repo and no key setup. Use `git+https://` unless you are explicitly managing deploy keys.

> **Monorepo warning:** Earlier versions of bug-catcher were a two-package npm workspace (`@kari/bug-catcher-react` + `@kari/bug-catcher-server`). Consumer `npm install` only exposed the root, not the nested packages. v0.1.1+ is a single flat package with three subpath exports. If you see "Cannot find module '@kari/bug-catcher/react'" make sure you are on v0.1.1 or later.

---

## Step 2: Provision the Google Sheet

1. Create a new Google Sheet titled something like `<APP NAME> Bug Reports`.
2. Rename the default "Sheet1" tab to exactly `bug_reports` (all lowercase, underscore, no spaces). The handler hardcodes this tab name. Any other name breaks row insertion silently.
3. Click cell A1 of the `bug_reports` tab. Paste **this exact 9-column header row** (tab-separated):

```
timestamp	app_name	source	user_id	client_slug	url_path	description	screenshot_url	user_agent
```

To copy that precisely: select all text between the backticks above, paste into A1. Sheets will split on tabs and fill columns A through I automatically.

> **Nail-inspo header mismatch warning.** If you worked with nail-inspo before, its header row used `tech_id` as column D and did not have an `app_name` column. bug-catcher v1 changed both. Column B is `app_name` (new) and column D is `user_id` (was `tech_id`). Do not copy-paste from an existing nail-inspo Sheet.

4. Share the Sheet with your GCP service account email (see Step 3 for how to get that email):
   - Click Share in Google Sheets.
   - Paste the service account email (format: `something@project-id.iam.gserviceaccount.com`).
   - Set role to **Editor**.
   - Uncheck "Notify people."
   - Click Share.

   **If you forget this step:** every bug report will fail Sheets write silently (backed up to Postgres). The handler returns 200 via the backup path. The operator sees "Sent" but no row appears. Error in Vercel logs: `"The caller does not have permission"`.

5. Copy the Sheet ID from the URL. It is the 44-character string between `/spreadsheets/d/` and `/edit`:

```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                         This is the Sheet ID (44 chars)
```

---

## Step 3: Create the GCP service account

1. Go to [GCP Console](https://console.cloud.google.com/) > your project > **IAM & Admin** > **Service Accounts**.
2. Create a new service account (name it something like `bug-catcher-sheets`). Note the email address (format: `bug-catcher-sheets@your-project.iam.gserviceaccount.com`).
3. Click the service account > **Keys** > **Add Key** > **Create new key** > **JSON**. Download the file.
4. The downloaded JSON is the value for `GOOGLE_SHEETS_CREDENTIALS_JSON` (see Step 8). Do NOT paste the file path; paste the full JSON content.
5. Enable the Google Sheets API in GCP: **APIs & Services** > **Library** > search "Google Sheets API" > Enable.
6. Go back to Google Sheets and share the Sheet with the service account email you noted above (Step 2, sub-step 4).

---

## Step 4: Wire the CSS variables

In the layout or page where you mount the button, set these CSS custom properties on a scoped selector. **Scope to an admin-only class, not your general layout class.** In the PSBA install, `--bug-catcher-*` vars were set on `.psba-main`, which was also used by public pages, leaking the vars site-wide. The fix was a new `.psba-admin` class used only in the authenticated layout.

```css
/* Example: scope to admin layout only */
.your-admin-layout {
  --bug-catcher-bg: #ffffff;
  --bug-catcher-fg: #0a0a0a;
  --bug-catcher-accent: #your-accent-color;
  --bug-catcher-border: #e5e5e5;
  --bug-catcher-radius: 999px;
  --bug-catcher-shadow: 0 4px 12px rgba(0,0,0,0.15);
  --bug-catcher-font-display: 'Your Heading Font', serif;
  --bug-catcher-font-body: 'Your Body Font', sans-serif;
}
```

> **Brand token name warning.** Read the VALUE of your brand tokens, not the name. In the PSBA install, `--burnt` was actually `#ffc20e` (yellow), not burnt-orange. Mapping `--bug-catcher-accent` to `var(--burnt)` gave the Send button a yellow color. Always inspect the hex value in your brand kit before mapping.

---

## Step 5: Apply the Drizzle migration

bug-catcher ships a plain SQL migration at `migrations/0001-feedback-backup.sql`. Apply it once:

```bash
# Option A: psql
psql "$DATABASE_URL" < node_modules/@kari/bug-catcher/migrations/0001-feedback-backup.sql

# Option B: Drizzle (if your project uses drizzle-kit)
# Copy the SQL into your migrations directory, then:
npx drizzle-kit migrate
```

> **Pre-existing schema drift warning.** If you run `drizzle-kit generate` before applying bug-catcher's migration, Drizzle may bundle pre-existing consumer-side drift into the generated migration file. In the PSBA install, an `audit_log` table had been defined in `schema.ts` but never migrated. Drizzle bundled the `audit_log` catch-up into the same migration as `feedback_backup`, which was surprising.
>
> If `npm run db:generate` produces output that touches tables OTHER than `feedback_backup`, that is pre-existing consumer drift, not a bug-catcher bug. Handle it separately or use `IF NOT EXISTS` guards (already present in the provided SQL).

---

## Step 6: Add the API route

Create `app/api/bug-report/route.ts` in your Next.js app:

```typescript
import { createNextHandler } from '@kari/bug-catcher/server/next';

export const runtime = 'nodejs';

export const POST = createNextHandler({
  sheetId: process.env.BUG_CATCHER_SHEET_ID!,
  googleCredsJson: process.env.GOOGLE_SHEETS_CREDENTIALS_JSON!,
  blob: {
    token: process.env.BLOB_READ_WRITE_TOKEN!,
    prefix: 'bug-reports/',
  },
  appName: 'your-app-name', // appears in the app_name column of every Sheet row
  rateLimits: { tech: 30, anon: 5 }, // max reports per hour per source type
  isAuthed: async (req) => {
    // Return the authenticated user's ID string, or null if unauthenticated.
    // This value populates the user_id column.
    // Example using a session cookie:
    // const session = await getSession(req.headers);
    // return session?.user?.id ?? null;
    return null;
  },
});
```

---

## Step 7: Mount the button

In whichever layout or page should show the button:

```tsx
import { BugReportButton } from '@kari/bug-catcher/react';

// Inside your component:
<BugReportButton
  endpoint="/api/bug-report"
  corner="bottom-right"
  source="tech"
  mobileBottomOffset={0}
/>
```

To remap CSS vars inline, wrap in a `<div>` with a class that has the vars from Step 4, or set them directly:

```tsx
<div className="your-admin-layout">
  <BugReportButton endpoint="/api/bug-report" corner="bottom-right" />
</div>
```

---

## Step 8: Add the flush script and npm targets

The flush script replays rows that landed in `feedback_backup` (Sheets was temporarily unreachable) back to the Sheet. Create `scripts/flush-bug-reports.mjs` in your consumer app:

```javascript
import 'dotenv/config';
import { createFlushJob } from '@kari/bug-catcher/server';
import { db } from '../lib/db.js'; // your Drizzle db instance

const flush = createFlushJob({
  sheetId: process.env.BUG_CATCHER_SHEET_ID,
  sheetName: 'bug_reports',
  selectUnflushed: async () =>
    db.execute(
      `SELECT * FROM feedback_backup WHERE flushed_to_sheet_at IS NULL ORDER BY created_at LIMIT 50`
    ).then((r) => r.rows),
  markFlushed: async (id) =>
    db.execute(
      `UPDATE feedback_backup SET flushed_to_sheet_at = NOW() WHERE id = $1`, [id]
    ),
});

const result = await flush();
console.log(`[flush] ok=${result.ok} fail=${result.fail}`);
```

Add npm targets:

```json
"scripts": {
  "bug-report:flush": "node scripts/flush-bug-reports.mjs",
  "bug-catcher:validate": "node node_modules/@kari/bug-catcher/scripts/validate-install.mjs"
}
```

---

## Step 9: Set env vars (local + Vercel)

### Local (.env)

```
BUG_CATCHER_SHEET_ID=<44-char Sheet ID from Step 2>
GOOGLE_SHEETS_CREDENTIALS_JSON=<full JSON from the service account key file>
BLOB_READ_WRITE_TOKEN=<from Vercel project settings>
```

### Vercel (Production scope required)

Go to your Vercel project > Settings > Environment Variables. Add each one with **Production** (and optionally Preview) scope.

> **Clipboard overwrite warning.** During the PSBA install, the Vercel env var "Value" field received a URL instead of the actual value TWICE. The failure mode: copying the page URL or a markdown link from another tab while filling in the form overwrites your clipboard. The env var saves without error. Validation only catches it after a real bug report fires. Strategy to avoid it: type the variable name first, THEN open a separate terminal or file to copy the value, THEN paste.

> **Sheet ID paste check:** The Sheet ID is exactly 44 characters and starts with a letter or digit, not "http". If you paste a URL here by mistake, the validator will catch it with: `"BUG_CATCHER_SHEET_ID looks like a URL"`.

> **JSON paste check:** `GOOGLE_SHEETS_CREDENTIALS_JSON` must be the raw JSON object starting with `{`. Do not add outer quotes. Do not paste the URL to the GCP console page. If you paste a URL, the validator catches it with: `"GOOGLE_SHEETS_CREDENTIALS_JSON looks like a URL"`.

> **Blob token gotcha:** `BLOB_READ_WRITE_TOKEN` may be empty even when the Vercel Blob integration shows "Connected" in the dashboard. Vercel does not always auto-populate the variable when you add the integration to an existing project. Go to Vercel > project > Settings > Environment Variables, find `BLOB_READ_WRITE_TOKEN`, and verify it has a value starting with `vercel_blob_rw_`. If empty, copy it from the Blob integration detail page.

---

## Step 10: Validate the install

Run the pre-flight validator before submitting any real reports:

```bash
npm run bug-catcher:validate
```

Expected output when all checks pass:

```
[bug-catcher validate]

✓ BUG_CATCHER_SHEET_ID present (44 chars)
✓ GOOGLE_SHEETS_CREDENTIALS_JSON valid JSON (service account: bug-catcher@project.iam.gserviceaccount.com)
✓ BLOB_READ_WRITE_TOKEN present (vercel_blob_rw_ shape)

✓ Sheet accessible (title: "PSBA Bug Reports")
✓ bug_reports tab exists
✓ Header row matches expected 9 columns

✓ Blob upload smoke test passed

READY: bug-catcher install verified. Submit a real test report from your app to confirm end-to-end.
```

---

## Step 11: First live verification

1. Deploy your app (or run locally with `npm run dev`).
2. Navigate to the page with the bug report button.
3. Click "Report bug."
4. Fill in a short description and optionally attach a screenshot.
5. Click Send. Modal should show "Sent."
6. Open the Google Sheet: a new row should appear in the `bug_reports` tab with all 9 columns populated.
7. If the row does NOT appear: open Vercel runtime logs for the `/api/bug-report` route and look for `[bug-catcher] Sheets write failed`. Also check the `feedback_backup` table: rows accumulating there (with a non-null `sheets_error`) means Sheets is broken.

---

## Silent-failure behavior: what "Sent" actually means

The handler returns HTTP 200 in two cases:

1. **Normal path:** row written to Google Sheets successfully.
2. **Backup path:** Sheets write failed, row saved to `feedback_backup` Postgres table instead. Response body includes `{ ok: true, backed_up: true }`.

In both cases the modal shows "Sent" (accurately; the report is saved). The operator has no visible signal that Sheets is not receiving rows. **Monitor `feedback_backup` regularly.** If rows accumulate there with non-null `sheets_error`, the Sheets path is broken and needs attention.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `"The caller does not have permission"` in logs | Sheet not shared with service account | Share Sheet with service account email (Editor role) |
| `"Requested entity was not found"` in logs | Sheet ID env var is wrong | Verify BUG_CATCHER_SHEET_ID is the 44-char string from the Sheet URL, not the URL itself |
| `"GOOGLE_SHEETS_CREDENTIALS_JSON is not valid JSON: Unexpected token 'h', "https://ve"..."` | JSON env var contains a URL | Re-paste from service account JSON key file |
| `BLOB_READ_WRITE_TOKEN` empty | Vercel Blob integration did not auto-populate token | Copy token manually from Vercel > Settings > Environment Variables |
| Rows missing from Sheet despite "Sent" | Backup path is catching Sheets failures | Check Vercel logs for `Sheets write failed`; check `feedback_backup` table |
| Migration generates changes to tables you did not expect | Pre-existing schema drift in consumer app | Separate the drift catch-up migration from bug-catcher's; both SQL files use IF NOT EXISTS guards |
| Build fails with `Permission denied (publickey)` on Vercel | Bug-catcher repo is private with no deploy key | Make the repo public OR configure GitHub auth in your Vercel account |
| Button or modal uses wrong accent color | Brand token name is misleading | Read the hex VALUE of your brand token, not its name |
| CSS vars leak to public pages | Scoped to a class shared with non-admin pages | Create a dedicated admin-only CSS class and scope bug-catcher vars to it |
| `Cannot find module '@kari/bug-catcher/react'` | Old monorepo version installed | Upgrade to v0.1.1 or later |
