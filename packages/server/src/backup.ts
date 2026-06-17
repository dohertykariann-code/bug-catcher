import { appendRow } from './sheets.js';
import type { FlushDeps, FlushResult, UnflushedRow } from './types.js';

function rowToSheetValues(row: UnflushedRow): unknown[] {
  return [
    row.timestamp,
    row.app_name,
    row.source,
    row.user_id,
    row.client_slug,
    row.url_path,
    row.description,
    row.screenshot_url,
    row.user_agent,
  ];
}

export interface FlushOptions {
  dryRun?: boolean;
}

export function createFlushJob(deps: FlushDeps) {
  return async (opts: FlushOptions = {}): Promise<FlushResult> => {
    const rows = await deps.selectUnflushed();
    let ok = 0;
    let fail = 0;
    for (const row of rows) {
      const values = rowToSheetValues(row);
      // eslint-disable-next-line no-console
      console.log(
        `[bug-catcher] flush ${row.timestamp} | ${row.source} | ${(row.description || '').slice(0, 60)}`,
      );
      if (opts.dryRun) continue;
      try {
        await appendRow(deps.sheetId, deps.sheetName, values);
        await deps.markFlushed(row.id);
        ok += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(`[bug-catcher] flush failed for ${row.id}: ${msg}`);
        fail += 1;
      }
    }
    return { ok, fail };
  };
}
