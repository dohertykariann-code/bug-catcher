import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/blob');
vi.mock('nanoid', () => ({ nanoid: () => 'fixedId' }));

import { uploadScreenshot } from '../blob.js';
import { put } from '@vercel/blob';

const mockPut = vi.mocked(put);

describe('uploadScreenshot', () => {
  beforeEach(() => mockPut.mockReset());

  it('uploads a PNG to the configured prefix and returns the URL', async () => {
    mockPut.mockResolvedValueOnce({ url: 'https://blob.example/bug-reports/fixedId.png' });
    const url = await uploadScreenshot({
      buffer: Buffer.from('PNG-bytes'),
      mimeType: 'image/png',
      token: 'tok',
      prefix: 'bug-reports/',
    });
    expect(url).toBe('https://blob.example/bug-reports/fixedId.png');
    expect(mockPut).toHaveBeenCalledWith(
      'bug-reports/fixedId.png',
      expect.any(Buffer),
      { access: 'public', token: 'tok', contentType: 'image/png' },
    );
  });

  it('defaults to image/jpeg extension when mime is unknown', async () => {
    mockPut.mockResolvedValueOnce({ url: 'https://blob.example/bug-reports/fixedId.jpg' });
    const url = await uploadScreenshot({
      buffer: Buffer.from('x'),
      mimeType: 'application/x-thing',
      token: 'tok',
      prefix: 'bug-reports/',
    });
    expect(url).toContain('.jpg');
  });

  it('propagates upload errors', async () => {
    mockPut.mockRejectedValueOnce(new Error('blob 503'));
    await expect(
      uploadScreenshot({
        buffer: Buffer.from('x'),
        mimeType: 'image/png',
        token: 'tok',
        prefix: 'bug-reports/',
      }),
    ).rejects.toThrow('blob 503');
  });
});
