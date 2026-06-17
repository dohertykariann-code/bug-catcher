import { bugReportSchema } from './schema.js';
import { appendRow } from './sheets.js';
import { uploadScreenshot } from './blob.js';
import { createRateLimiter } from './rateLimit.js';
import type { BackupDeps, BugReportRow, BugReportSource } from './types.js';

export interface BugCatcherDeps {
  sheetId: string;
  googleCredsJson: string;
  blob: { token: string; prefix: string };
  appName: string;
  rateLimits: { tech: number; anon: number };
  isAuthed: (req: HandlerRequest) => Promise<string | null>;
  validateSlug?: (slug: string) => Promise<boolean>;
  backup?: BackupDeps;
  ipFor?: (req: HandlerRequest) => string;
  now?: () => Date;
}

export interface HandlerRequest {
  body: unknown;
  headers?: Record<string, string | undefined>;
  ip?: string;
}

export interface HandlerResponse {
  status: number;
  body: Record<string, unknown>;
}

// Tiered limiters live per-deps. Shared across calls of the same handler
// instance. createNextHandler() instantiates once; framework-agnostic
// callers should reuse the same deps object across requests for the same
// reason.
const limiterCache = new WeakMap<BugCatcherDeps, ReturnType<typeof createLimiterPair>>();

function createLimiterPair(deps: BugCatcherDeps) {
  return {
    tech: createRateLimiter({ windowMs: 60 * 60 * 1000, max: deps.rateLimits.tech }),
    anon: createRateLimiter({ windowMs: 60 * 60 * 1000, max: deps.rateLimits.anon }),
  };
}

function getLimiters(deps: BugCatcherDeps) {
  let pair = limiterCache.get(deps);
  if (!pair) {
    pair = createLimiterPair(deps);
    limiterCache.set(deps, pair);
  }
  return pair;
}

function ipOf(deps: BugCatcherDeps, req: HandlerRequest): string {
  if (deps.ipFor) return deps.ipFor(req);
  return req.ip ?? req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ?? 'unknown';
}

export async function handleBugReport(
  deps: BugCatcherDeps,
  req: HandlerRequest,
): Promise<HandlerResponse> {
  // 503 env check (per-request, not boot, per nail-inspo 2026-05-27 lesson).
  if (!deps.sheetId || !deps.googleCredsJson) {
    return { status: 503, body: { error: 'feedback_not_configured' } };
  }
  // Set creds env so sheets.ts can lazy-init.
  process.env.GOOGLE_SHEETS_CREDENTIALS_JSON = deps.googleCredsJson;

  // Zod parse.
  const parsed = bugReportSchema.safeParse(req.body);
  if (!parsed.success) return { status: 400, body: { error: 'invalid_body' } };
  const body = parsed.data;

  // Auth + rate-limit tier selection.
  const userId = body.source === 'tech' ? await deps.isAuthed(req) : null;
  if (body.source === 'tech' && !userId) {
    return { status: 401, body: { error: 'unauthorized' } };
  }

  const limiters = getLimiters(deps);
  const limiter = body.source === 'tech' && userId ? limiters.tech : limiters.anon;
  const ip = ipOf(deps, req);
  const decision = limiter.check(ip);
  if (!decision.allowed) return { status: 429, body: { error: 'rate_limited' } };

  // Slug check (client mode only).
  if (body.source === 'client' && body.client_slug && deps.validateSlug) {
    let ok = false;
    try {
      ok = await deps.validateSlug(body.client_slug);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bug-catcher] validateSlug threw, treating as false:', err instanceof Error ? err.message : err);
      ok = false;
    }
    if (!ok) return { status: 400, body: { error: 'invalid_body' } };
  }

  // Empty submission.
  if (!body.description.trim() && !body.screenshot_base64) {
    return { status: 400, body: { error: 'empty_submission' } };
  }

  // Screenshot upload (swallow failures).
  let screenshotUrl = '';
  if (body.screenshot_base64) {
    try {
      const buf = Buffer.from(body.screenshot_base64, 'base64');
      screenshotUrl = await uploadScreenshot({
        buffer: buf,
        mimeType: body.screenshot_mime ?? 'image/jpeg',
        token: deps.blob.token,
        prefix: deps.blob.prefix,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bug-catcher] screenshot upload failed:', err instanceof Error ? err.message : err);
    }
  }

  const truncatedUA = (body.user_agent ?? '').slice(0, 500);
  const nowIso = (deps.now ? deps.now() : new Date()).toISOString();

  const row: BugReportRow = {
    timestamp: nowIso,
    app_name: deps.appName,
    source: body.source as BugReportSource,
    user_id: userId ?? '',
    client_slug: body.source === 'client' ? (body.client_slug ?? '') : '',
    url_path: body.url_path,
    description: body.description,
    screenshot_url: screenshotUrl,
    user_agent: truncatedUA,
  };

  try {
    await appendRow(deps.sheetId, 'bug_reports', [
      row.timestamp,
      row.app_name,
      row.source,
      row.user_id,
      row.client_slug,
      row.url_path,
      row.description,
      row.screenshot_url,
      row.user_agent,
    ]);
    return { status: 200, body: { ok: true } };
  } catch (sheetsErr) {
    const sheetsMsg = sheetsErr instanceof Error ? sheetsErr.message : String(sheetsErr);
    // eslint-disable-next-line no-console
    console.error('[bug-catcher] Sheets write failed:', sheetsMsg);

    if (!deps.backup) {
      return { status: 500, body: { error: 'sheets_write_failed' } };
    }

    try {
      await deps.backup.insert({
        row,
        sheets_error: sheetsMsg,
        idempotency_key: body.idempotency_key ?? null,
      });
      return { status: 200, body: { ok: true, backed_up: true } };
    } catch (backupErr) {
      const code = (backupErr as { code?: string } | null)?.code;
      if (code === '23505' && body.idempotency_key) {
        return { status: 200, body: { ok: true, backed_up: true, replayed: true } };
      }
      // eslint-disable-next-line no-console
      console.error('[bug-catcher] backup insert failed:', backupErr instanceof Error ? backupErr.message : backupErr);
      return { status: 500, body: { error: 'sheets_write_failed' } };
    }
  }
}
