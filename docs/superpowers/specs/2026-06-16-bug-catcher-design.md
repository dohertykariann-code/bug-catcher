# bug-catcher Design Spec

**Date:** 2026-06-16
**Status:** Approved (brainstorming complete, awaiting implementation plan)
**Prebuild manifest:** `~/.claude/c-suite/prebuild/bug-catcher-manifest.md`
**Source-of-truth port:** `~/Projects/nail-inspo/src/components/BugReport{Button,Modal}.jsx`, `~/Projects/nail-inspo/server/routes/feedback.js`, `~/Projects/nail-inspo/scripts/flush-feedback-backup.mjs`
**First install target:** PSBA admin site at `~/code/psba/public-site/app/admin/*`

## Purpose

A reusable "report a bug" module Kari can drop into any app she's building. Floating button stays pinned across every screen of the consumer app. Click opens a modal with a description field plus optional screenshot upload. POST routes to a per-install Google Sheet, with a Postgres backup table catching Sheets outages. Each install has its own Sheet, its own Blob prefix, its own env vars.

## Goals

1. One source of truth replaces the 4 drifting bug-reporter implementations Kari currently maintains (nail-inspo, 5k-method, cro-sprint-engine, c-suite-dashboard).
2. Drop-in install in any Next.js App Router app (PSBA first). Five files or fewer touched in the consumer.
3. No brand lock-in. Module ships with zero default colors. Consumer's brand kit drives all visuals via CSS custom properties.
4. Every install is its own multi-tenant boundary (own Sheet, own Blob prefix, own env vars). No cross-contamination.

## Non-goals (v1)

1. Express adapter. Deferred to v2 when we migrate the 3 existing JSX cousins.
2. Migration of the existing 3 cousin implementations. Deferred to v2.
3. Cron-scheduled flush. v1 ships a manual flush script only.
4. Sentry/external telemetry hooks. v1 logs to stdout, consumer can wrap if needed.
5. Live load testing of the rate limiter. `express-rate-limit`'s in-memory store is fine for beta.

## Architecture

### Repo layout

```
~/Projects/bug-catcher/
├── package.json              (npm workspace root, "private": true)
├── README.md
├── packages/
│   ├── react/
│   │   ├── package.json      (name: "@kari/bug-catcher-react")
│   │   ├── src/
│   │   │   ├── BugReportButton.tsx
│   │   │   ├── BugReportModal.tsx
│   │   │   ├── upload.ts     (readFileAsBase64 helper)
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── README.md
│   │   └── tsconfig.json
│   └── server/
│       ├── package.json      (name: "@kari/bug-catcher-server")
│       ├── src/
│       │   ├── schema.ts     (Zod request body)
│       │   ├── sheets.ts     (appendRow wrapper via googleapis)
│       │   ├── blob.ts       (Vercel Blob upload wrapper)
│       │   ├── backup.ts     (insertBackup + createFlushJob)
│       │   ├── handler.ts    (framework-agnostic core handler)
│       │   ├── next.ts       (Next.js App Router adapter)
│       │   └── index.ts
│       ├── migrations/
│       │   └── 0001-feedback-backup.sql
│       ├── README.md
│       └── tsconfig.json
└── .gitignore
```

### Tooling choices

- **npm workspaces** (not pnpm). Both consumer repos use npm; matching tooling reduces drift.
- **TypeScript everywhere.** Even though nail-inspo's source is JSX, the new module is the SOT for everything downstream. TS gives Next.js consumers clean types.
- **Next.js adapter as a subpath export** (`@kari/bug-catcher-server/next`), not a separate package. Same package, separate entry point, no version skew.
- **`@kari` scope is cosmetic** until/unless we publish to npm. For git-install, the consumer's package.json references the git URL and aliases it.
- **Migrations folder ships SQL.** Consumer copies into their Drizzle migrations dir. No auto-running migrations from a third-party package.

### Distribution

Git-install via SSH. Consumer's `package.json`:

```json
"@kari/bug-catcher-react": "git+ssh://github.com/dohertykariann-code/bug-catcher.git#main",
"@kari/bug-catcher-server": "git+ssh://github.com/dohertykariann-code/bug-catcher.git#main"
```

Both packages resolve from the same monorepo. Consumer pins to a tag (`#v0.1.0`) for stability if desired. No npm publish step in v1. Revisit if a 4th consumer appears or public discoverability becomes useful.

## API Surface

### `@kari/bug-catcher-react`

**Primary component:**

```tsx
import { BugReportButton } from '@kari/bug-catcher-react';

<BugReportButton
  endpoint="/api/bug-report"           // required
  corner="bottom-right"                // 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
  mobileBottomOffset={0}               // px added to bottom on screens < 768px
  source="tech"                        // 'tech' | 'client' (default 'tech')
  clientSlug={undefined}               // only when source='client'
  authHeader={undefined}               // optional { name, value }
  copy={{...}}                         // all strings overridable; sensible defaults
  onSubmitted={() => {}}               // optional
/>
```

**All exports:**

- `BugReportButton` (composite: button + modal, internally controlled)
- `BugReportModal` (raw modal, for consumers with their own trigger)
- `defaultCopy` (for spread-override)
- Type exports: `BugReportButtonProps`, `BugReportCopy`, `BugReportSource`, `BugReportCorner`

**Styling:** zero default colors shipped. All visuals read CSS custom properties from the host page:

- `--bug-catcher-bg` (modal + button fill)
- `--bug-catcher-fg` (text)
- `--bug-catcher-accent` (Send button)
- `--bug-catcher-border` (border color)
- `--bug-catcher-radius` (corner radius)
- `--bug-catcher-shadow` (sticker-style optional; can be `none`)
- `--bug-catcher-font-display` (heading font)
- `--bug-catcher-font-body` (textarea + button font)

### `@kari/bug-catcher-server`

**Framework-agnostic core:**

```ts
import { handleBugReport, createFlushJob } from '@kari/bug-catcher-server';
```

**Next.js App Router adapter:**

```ts
import { createNextHandler } from '@kari/bug-catcher-server/next';

// app/api/bug-report/route.ts
export const POST = createNextHandler({
  sheetId: process.env.BUG_CATCHER_SHEET_ID!,
  googleCredsJson: process.env.GOOGLE_SHEETS_CREDENTIALS_JSON!,
  blob: {
    token: process.env.BLOB_READ_WRITE_TOKEN!,
    prefix: 'bug-reports/',
  },
  appName: 'psba-admin',
  rateLimits: { tech: 30, anon: 5 },     // per hour, per IP
  validateSlug: undefined,                // PSBA tech-only
  isAuthed: async (req) => {              // returns userId or null
    const session = await getSession(req);
    return session?.userId ?? null;
  },
  backup: {                               // optional; omit to disable
    insert: async (row) => {/* consumer Drizzle insert */},
  },
});
```

**All exports:**

- `handleBugReport(deps, requestBody)` returns `{ status, body }`. Framework-agnostic.
- `createNextHandler(deps)` from `/next` subpath.
- `createFlushJob({ selectUnflushed, markFlushed, sheetId, googleCredsJson, sheetName, appName })` returns `async ({ dryRun }) => { ok, fail }`.
- `bugReportSchema` (Zod, exported so consumers can extend or inspect).
- Type exports: `BugCatcherDeps`, `BugReportRow`, `FlushResult`.

**Design call:** `isAuthed` and `validateSlug` are consumer-provided async callbacks. The module never touches the consumer's auth library or DB schema. PSBA's bcrypt+session auth and nail-inspo's auth plug in identically.

## Data Flow

### Happy path

```
1. Admin on /admin/* page
   BugReportButton renders at corner, reads PSBA CSS vars

2. Click button
   Modal opens (z-[70]), focus textarea

3. Click Send
   Client reads file as base64 (readFileAsBase64 helper, ported from nail-inspo)
   POST /api/bug-report with:
     { source, description, screenshot_base64?, screenshot_mime?,
       url_path: window.location.pathname, user_agent,
       idempotency_key: crypto.randomUUID() }

4. createNextHandler receives POST
   a. Env check (sheetId + creds present) or 503
   b. Rate limit (tiered, skipped in NODE_ENV=test)
   c. Zod parse or 400
   d. isAuthed(req) check; source=tech without userId is 401
   e. source=client + slug present, run validateSlug; false is 400
   f. Empty submission (no description AND no screenshot) is 400

5. Screenshot upload (if present)
   Buffer.from(base64, 'base64')
   vercelBlob.put('bug-reports/{nanoid}.{ext}', buffer, { access: 'public', token })
   On failure: log + swallow, screenshotUrl = ''

6. Sheet append
   row = [timestamp, app_name, source, userId, clientSlug, url_path,
          description, screenshotUrl, truncatedUA]
   sheets.spreadsheets.values.append(...)
   Return 200 { ok: true }

7. Sheet failure
   Log error
   If backup.insert provided, call it with row + idempotency_key:
     unique violation (replay): return 200 { ok: true, backed_up: true, replayed: true }
     other DB error: return 500 sheets_write_failed
   If no backup.insert: return 500 sheets_write_failed
```

### Flush job (manual)

```
$ node --env-file=.env.local scripts/flush-bug-reports.mjs [--dry-run]

import { createFlushJob } from '@kari/bug-catcher-server';
import { db } from '@/db';
const flush = createFlushJob({
  selectUnflushed: async () => db.select().from(feedbackBackup).where(...),
  markFlushed: async (id) => db.update(feedbackBackup).set({flushed_to_sheet_at: new Date()}).where(eq(id, ...)),
  sheetId: process.env.BUG_CATCHER_SHEET_ID,
  googleCredsJson: process.env.GOOGLE_SHEETS_CREDENTIALS_JSON,
  sheetName: 'bug_reports',
  appName: 'psba-admin',
});
await flush({ dryRun: process.argv.includes('--dry-run') });
```

### Sheet row schema

`bug_reports` tab header row:

```
timestamp | app_name | source | user_id | client_slug | url_path | description | screenshot_url | user_agent
```

The new `app_name` column (column B, after timestamp) is the schema change from nail-inspo. Future-proofs cross-app triage. nail-inspo's existing Sheet will need a one-time migration (add column + backfill `app_name='nail-inspo'`) when v2 consolidates it.

## Error Handling

### Server response codes

| Status | When | Body |
|---|---|---|
| 200 | Sheet write succeeded | `{ok:true}` |
| 200 | Sheet failed, backup table caught | `{ok:true, backed_up:true}` |
| 200 | Idempotency replay | `{ok:true, backed_up:true, replayed:true}` |
| 400 | Zod parse fail or slug not found | `{error:'invalid_body'}` |
| 400 | Description AND screenshot both empty | `{error:'empty_submission'}` |
| 401 | source=tech without authed user | `{error:'unauthorized'}` |
| 429 | Rate limit tripped | `{error:'rate_limited'}` |
| 500 | Sheets failed AND backup failed (or no backup configured) | `{error:'sheets_write_failed'}` |
| 503 | Required env vars missing | `{error:'feedback_not_configured'}` |

### Client-side handling

| Failure | Handling |
|---|---|
| File over MAX_FILE_BYTES (default 4MB) | Inline error: "Screenshot too large." Send stays enabled if description present. |
| `fetch` throws (network) | Caught. Modal shows failure copy. idempotency_key persists in state so retry does not duplicate. |
| Modal closed mid-send | Component unmount during fetch is fine. Request still resolves server-side. User just does not see result. Backup-table idempotency prevents duplicate write on retry. |
| Blob URL leak (screenshot preview) | `useEffect` cleanup runs `URL.revokeObjectURL` on screenshot change + unmount. |

### Operator copy decision

Operator-facing copy never distinguishes "Sheet succeeded" from "Sheet failed but backup caught it." Both read as "Sent." Operators do not need to know about storage tiers. Kari (running the flush job manually) sees the backup table state.

### Observability

- Server logs prefixed `[bug-catcher]`. Consumer can grep.
- No external telemetry hooks in v1. No Sentry. No metric emit.
- The Sheet itself is the operator-facing observability layer.

## Testing Strategy

### In the package repo

| What | Where | Tool |
|---|---|---|
| Zod schema valid + invalid cases | `packages/server/src/__tests__/schema.test.ts` | vitest |
| `handleBugReport` happy path | `packages/server/src/__tests__/handler.test.ts` | vitest |
| `handleBugReport` Sheet-fail, backup-succeed | same | vitest |
| `handleBugReport` Sheet-fail, backup-fail | same | vitest |
| `handleBugReport` backup unique-violation (replay) | same | vitest |
| `handleBugReport` auth gate (401 path) | same | vitest |
| `handleBugReport` slug validator (400 path) | same | vitest |
| `handleBugReport` env missing (503 path) | same | vitest |
| `handleBugReport` empty submission (400 path) | same | vitest |
| `createFlushJob` dry-run | `packages/server/src/__tests__/flush.test.ts` | vitest |
| `createFlushJob` happy path | same | vitest |
| `createFlushJob` partial failure | same | vitest |
| `BugReportModal` renders, focuses, disables Send when empty | `packages/react/src/__tests__/BugReportModal.test.tsx` | vitest + @testing-library/react |
| `BugReportModal` POST flow | same | vitest, mocked fetch |
| `BugReportModal` rate-limit copy | same | vitest |
| `BugReportButton` renders at the right corner | `packages/react/src/__tests__/BugReportButton.test.tsx` | vitest |

No e2e in the package repo. It is a library. E2E lives in the consumer.

### In the PSBA install

| What | Where | Tool |
|---|---|---|
| `/api/bug-report` POST contract test | `psba/public-site/__tests__/bug-report.test.ts` | vitest |
| Button on every admin route except `/admin/login` | `psba/public-site/e2e/bug-report.spec.ts` | playwright |
| Submit happy path | same | playwright + mock |
| Mobile `/admin` stacks above speed dial | same, mobile viewport | playwright |

### Skipped in v1

- No tests against a real Google Sheet. Mock `appendRow`.
- No tests against real Vercel Blob. Mock upload.
- No load test of rate limiter.
- No screenshot diff testing across consumer brand kits. By-eye sign-off per install.

### Live-integration-verify gate

After PSBA install, one real end-to-end run. Click button on a real PSBA admin page, file a real bug, confirm row appears in real PSBA Sheet, confirm screenshot URL resolves to a real Vercel Blob. Per `/live-integration-verify` skill, non-negotiable for anything touching external services.

## Decisions Log

Settled during brainstorming 2026-06-16:

| ID | Question | Decision |
|---|---|---|
| Q1 | Package repo home | Standalone workspace at `~/Projects/bug-catcher` |
| Q2 | Distribution | Git-install via SSH from `github.com/dohertykariann-code/bug-catcher` |
| Q3 | Slug validator interface | Callback prop on the route factory: `validateSlug: async (slug) => boolean` |
| Q4 | Backup flush | Module ships `createFlushJob(deps)` helper. Consumer wires into manual script. No cron in v1. |
| Q5 | PSBA Sheet provisioning | Fresh Google Sheet titled "PSBA Bug Reports" |
| Q6 | PSBA button position | Desktop bottom-right. Mobile bottom-right with extra offset on `/admin` route to stack above existing speed dial FAB. Corner is a prop. |

Settled during prebuild 2026-06-16:

- **Module shape:** two npm packages plus a Next.js subpath adapter. Express adapter deferred to v2.
- **Screenshot storage:** reuse consumer's existing Vercel Blob with `bug-reports/` prefix.
- **DB backup:** keep Postgres `feedback_backup` fallback. Module ships SQL migration plus Drizzle-compatible helper.
- **Auth modes:** module supports both `tech` (authed) and `client` (anon + slug) modes. PSBA install uses tech-only.
- **Theming:** zero default brand. CSS custom properties drive all visuals.

## PSBA Install Plan (outline only; full plan in writing-plans)

Files touched in PSBA:

1. `public-site/package.json`: add both `@kari/bug-catcher-*` git deps
2. `public-site/app/admin/layout.tsx`: import + mount `<BugReportButton>`, conditionally apply `mobileBottomOffset` on the `/admin` route only (where the dashboard speed dial lives)
3. `public-site/app/api/bug-report/route.ts`: new file, exports `POST = createNextHandler({...})`
4. `public-site/app/globals.css`: define `--bug-catcher-*` CSS vars under `.psba-main` to match the PSBA brand kit
5. `public-site/db/schema.ts` plus a new Drizzle migration: add `feedback_backup` table
6. `public-site/scripts/flush-bug-reports.mjs`: new file, 5-line wrapper around `createFlushJob`
7. `public-site/.env.local` plus `.env.example`: add `BUG_CATCHER_SHEET_ID` + `GOOGLE_SHEETS_CREDENTIALS_JSON`

Login route (`/admin/login`) does NOT mount the button. Button shows on every authed admin route.

## Brand/Voice Constraints

Module ships zero brand defaults. Each consumer overrides via CSS custom properties. The PSBA install reads burnt-orange + Source Serif (or whatever PSBA brand kit currently specifies) from PSBA's `globals.css`. Nail-inspo install retains its sticker aesthetic via its own vars.

Default copy strings shipped in the module use plain American English. No em-dashes in any default copy (per Kari's voice rules). Consumer overrides every string via the `copy` prop.

## Open Follow-ups (post-v1)

- Express adapter (unlocks 5k-method, cro-sprint-engine, c-suite-dashboard consolidation)
- Migration of the 3 existing cousin implementations
- Optional Slack webhook on Sheets failure (so Kari knows the backup table is accumulating)
- Markdown/screenshot preview in the Sheet (currently just URL)
- Public npm publish (revisit when a 4th consumer appears)

## Next step

Invoke `writing-plans` to produce the implementation plan. Plan should cover: (1) workspace scaffold, (2) react package, (3) server package, (4) Next.js adapter, (5) tests, (6) PSBA install, (7) live-integration-verify.
