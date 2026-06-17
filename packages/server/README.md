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

(Filled in once API surface lands.)
