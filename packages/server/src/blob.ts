import { put } from '@vercel/blob';
import { nanoid } from 'nanoid';

export interface UploadScreenshotInput {
  buffer: Buffer;
  mimeType: string;
  token: string;
  prefix: string;
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function uploadScreenshot(input: UploadScreenshotInput): Promise<string> {
  const ext = MIME_EXT[input.mimeType] ?? 'jpg';
  const pathname = `${input.prefix}${nanoid()}.${ext}`;
  const { url } = await put(pathname, input.buffer, {
    access: 'public',
    token: input.token,
    contentType: input.mimeType,
  });
  return url;
}
