# @kari/bug-catcher

A reusable floating "Report bug" button + Google Sheets backend, designed to drop into any app I'm building.

Single package with three subpath exports:

- `@kari/bug-catcher/react`: floating button and modal (React, peer-dep react@18+)
- `@kari/bug-catcher/server`: Zod schema, Sheets append, Vercel Blob upload, Postgres backup helper
- `@kari/bug-catcher/server/next`: Next.js App Router adapter (peer-dep next@14+)

## Install

Full step-by-step install runbook with every gotcha documented: **[INSTALL.md](./INSTALL.md)**

Quick version:

```json
"dependencies": {
  "@kari/bug-catcher": "git+https://github.com/dohertykariann-code/bug-catcher.git#v0.1.2"
}
```

> Use `git+https://` (not `git+ssh://`). The repo must be public OR you must configure Vercel GitHub auth; SSH deploy keys are required for private repos in CI.

## Validation

After setting env vars and before your first live test, run the pre-flight validator:

```bash
npm run bug-catcher:validate
# or
node node_modules/@kari/bug-catcher/scripts/validate-install.mjs
```

Checks: all three env vars present and well-formed, Sheet accessible, `bug_reports` tab exists, header row matches the expected 9 columns exactly, Blob token works.

## React side

```tsx
import { BugReportButton } from '@kari/bug-catcher/react';

<BugReportButton endpoint="/api/bug-report" corner="bottom-right" />
```

## Server side (Next.js App Router)

```ts
// app/api/bug-report/route.ts
import { createNextHandler } from '@kari/bug-catcher/server/next';

export const runtime = 'nodejs';
export const POST = createNextHandler({
  sheetId: process.env.BUG_CATCHER_SHEET_ID!,
  googleCredsJson: process.env.GOOGLE_SHEETS_CREDENTIALS_JSON!,
  blob: { token: process.env.BLOB_READ_WRITE_TOKEN!, prefix: 'bug-reports/' },
  appName: 'my-app',
  rateLimits: { tech: 30, anon: 5 },
  isAuthed: async () => null,
});
```

## CSS variables (react subpath)

Set these on the host page so the button and modal pick up your brand:

| Variable | Purpose |
|---|---|
| `--bug-catcher-bg` | Modal and button fill |
| `--bug-catcher-fg` | Text |
| `--bug-catcher-accent` | Send button |
| `--bug-catcher-border` | Border color |
| `--bug-catcher-radius` | Corner radius |
| `--bug-catcher-shadow` | Shadow (can be `none`) |
| `--bug-catcher-font-display` | Heading font |
| `--bug-catcher-font-body` | Body font |

### Mobile offset stack (consumer-side CSS)

```css
@media (max-width: 767px) {
  button[data-bug-catcher-button] {
    bottom: calc(1rem + var(--bug-catcher-mobile-offset, 0px));
  }
}
```

## DB migration

See `migrations/0001-feedback-backup.sql` for the Postgres feedback_backup table schema. Apply once via your DB tool (psql, Drizzle migrations, etc.).

## License

Private.
