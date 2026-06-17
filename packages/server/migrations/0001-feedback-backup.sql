-- bug-catcher v1: feedback_backup table.
-- Caught rows when Sheets write fails. createFlushJob replays them later.
-- Adapted from nail-inspo (server/db/schema.sql); column tech_id renamed to
-- user_id and new app_name column added so a single table can serve multi-app
-- installs once the Express adapter lands.

CREATE TABLE IF NOT EXISTS feedback_backup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  app_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  user_id TEXT,
  client_slug TEXT,
  url_path TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  screenshot_url TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  sheets_error TEXT NOT NULL,
  idempotency_key UUID,
  flushed_to_sheet_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS feedback_backup_unflushed_idx
  ON feedback_backup(created_at) WHERE flushed_to_sheet_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS feedback_backup_user_idempotency_uq
  ON feedback_backup(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
