# @kari/bug-catcher

A reusable floating "Report bug" button + Google Sheets backend, designed to drop into any app I'm building.

Single package with three subpath exports:

- `@kari/bug-catcher/react`: floating button and modal (React, peer-dep react@18+)
- `@kari/bug-catcher/server`: Zod schema, Sheets append, Vercel Blob upload, Postgres backup helper
- `@kari/bug-catcher/server/next`: Next.js App Router adapter (peer-dep next@14+)

## Install (consumer side)

```json
"dependencies": {
  "@kari/bug-catcher": "git+ssh://github.com/dohertykariann-code/bug-catcher.git#v0.1.1"
}
```

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
