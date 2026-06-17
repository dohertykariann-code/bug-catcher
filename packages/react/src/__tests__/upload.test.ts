import { describe, it, expect } from 'vitest';
import { readFileAsBase64, MAX_FILE_BYTES } from '../upload.js';

describe('readFileAsBase64', () => {
  it('returns image_base64, mime_type, filename', async () => {
    const blob = new Blob(['hello world'], { type: 'image/png' });
    const file = new File([blob], 'test.png', { type: 'image/png' });
    const result = await readFileAsBase64(file);
    expect(result.filename).toBe('test.png');
    expect(result.mime_type).toBe('image/png');
    expect(typeof result.image_base64).toBe('string');
    expect(result.image_base64.length).toBeGreaterThan(0);
    // base64 of "hello world" is "aGVsbG8gd29ybGQ="
    expect(result.image_base64).toBe('aGVsbG8gd29ybGQ=');
  });

  it('exports the 10MB cap matching nail-inspo precedent', () => {
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});
