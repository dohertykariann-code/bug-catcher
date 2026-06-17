export type BugReportSource = 'tech' | 'client';

export interface BugReportRow {
  timestamp: string;
  app_name: string;
  source: BugReportSource;
  user_id: string;
  client_slug: string;
  url_path: string;
  description: string;
  screenshot_url: string;
  user_agent: string;
}

export interface BackupInsertInput {
  row: BugReportRow;
  sheets_error: string;
  idempotency_key: string | null;
}

export interface BackupDeps {
  insert: (input: BackupInsertInput) => Promise<void>;
}

export interface UnflushedRow extends BugReportRow {
  id: string;
}

export interface FlushDeps {
  selectUnflushed: () => Promise<UnflushedRow[]>;
  markFlushed: (id: string) => Promise<void>;
  sheetId: string;
  sheetName: string;
}

export interface FlushResult {
  ok: number;
  fail: number;
}
