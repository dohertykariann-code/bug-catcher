import { NextResponse, type NextRequest } from 'next/server';
import { handleBugReport, type BugCatcherDeps } from './handler.js';

export function createNextHandler(deps: BugCatcherDeps) {
  return async function POST(req: NextRequest): Promise<NextResponse> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';
    const result = await handleBugReport(deps, {
      body,
      headers: Object.fromEntries(req.headers.entries()),
      ip,
    });
    return NextResponse.json(result.body, { status: result.status });
  };
}
