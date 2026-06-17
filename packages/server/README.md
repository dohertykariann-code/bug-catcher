# @kari/bug-catcher-server

Server-side helpers for the bug-catcher module. Framework-agnostic core plus a Next.js App Router adapter.

## Install

See `~/Projects/bug-catcher/README.md` for git-install setup.

## Required env vars

- `BUG_CATCHER_SHEET_ID`: Google Sheet ID for the consumer's bug reports
- `GOOGLE_SHEETS_CREDENTIALS_JSON`: service account JSON, single line
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token for screenshots

See `migrations/0001-feedback-backup.sql` for the backup table schema.

## Usage

### Next.js App Router

```ts
// app/api/bug-report/route.ts
import { createNextHandler } from '@kari/bug-catcher-server/next';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { feedbackBackup } from '@/lib/db/schema';

export const runtime = 'nodejs';

export const POST = createNextHandler({
  sheetId: process.env.BUG_CATCHER_SHEET_ID!,
  googleCredsJson: process.env.GOOGLE_SHEETS_CREDENTIALS_JSON!,
  blob: { token: process.env.BLOB_READ_WRITE_TOKEN!, prefix: 'bug-reports/' },
  appName: 'my-app',
  rateLimits: { tech: 30, anon: 5 },
  isAuthed: async () => {
    const s = await getSession();
    return s?.sub ?? null;
  },
  backup: {
    insert: async ({ row, sheets_error, idempotency_key }) => {
      await db.insert(feedbackBackup).values({
        appName: row.app_name,
        source: row.source,
        userId: row.user_id || null,
        clientSlug: row.client_slug || null,
        urlPath: row.url_path,
        description: row.description,
        screenshotUrl: row.screenshot_url,
        userAgent: row.user_agent,
        sheetsError: sheets_error,
        idempotencyKey: idempotency_key,
      });
    },
  },
});
```

### Flush script

```ts
// scripts/flush-bug-reports.mjs
import { createFlushJob } from '@kari/bug-catcher-server';
import { eq, isNull } from 'drizzle-orm';
import { db } from '../lib/db/client.js';
import { feedbackBackup } from '../lib/db/schema.js';

const flush = createFlushJob({
  selectUnflushed: async () => {
    const rows = await db.select().from(feedbackBackup).where(isNull(feedbackBackup.flushedToSheetAt));
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.createdAt.toISOString(),
      app_name: r.appName,
      source: r.source,
      user_id: r.userId ?? '',
      client_slug: r.clientSlug ?? '',
      url_path: r.urlPath,
      description: r.description,
      screenshot_url: r.screenshotUrl,
      user_agent: r.userAgent,
    }));
  },
  markFlushed: async (id) => {
    await db.update(feedbackBackup)
      .set({ flushedToSheetAt: new Date() })
      .where(eq(feedbackBackup.id, id));
  },
  sheetId: process.env.BUG_CATCHER_SHEET_ID,
  sheetName: 'bug_reports',
});

const result = await flush({ dryRun: process.argv.includes('--dry-run') });
console.log(`Flushed: ${result.ok}, failed: ${result.fail}`);
```
