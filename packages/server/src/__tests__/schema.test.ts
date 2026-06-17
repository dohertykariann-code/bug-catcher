import { describe, it, expect } from 'vitest';
import { bugReportSchema } from '../schema.js';

describe('bugReportSchema', () => {
  it('accepts a minimal tech body with description only', () => {
    const result = bugReportSchema.safeParse({
      source: 'tech',
      description: 'thing broke',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a client body with slug, description, and screenshot', () => {
    const result = bugReportSchema.safeParse({
      source: 'client',
      client_slug: 'abc123',
      description: 'oops',
      screenshot_base64: 'AAA',
      screenshot_mime: 'image/png',
      url_path: '/some/path',
      user_agent: 'Mozilla/5.0',
      idempotency_key: '00000000-0000-4000-8000-000000000000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown source', () => {
    const result = bugReportSchema.safeParse({ source: 'bogus', description: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID idempotency_key', () => {
    const result = bugReportSchema.safeParse({
      source: 'tech',
      description: 'x',
      idempotency_key: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('defaults description to empty string when omitted', () => {
    const result = bugReportSchema.safeParse({ source: 'tech' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe('');
  });

  it('caps description length at 10000 chars', () => {
    const result = bugReportSchema.safeParse({
      source: 'tech',
      description: 'x'.repeat(10_001),
    });
    expect(result.success).toBe(false);
  });
});
