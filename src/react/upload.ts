// 10MB cap matches nail-inspo (src/lib/upload.js). Bug-report screenshots
// are usually under 1MB; the cap is a safety net not a real boundary.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface ReadFileResult {
  image_base64: string;
  mime_type: string;
  filename: string;
}

// File to { image_base64, mime_type, filename }. Uses FileReader rather than
// btoa(String.fromCharCode(...)) because the latter crashes on images larger
// than the call-stack limit.
export function readFileAsBase64(file: File): Promise<ReadFileResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const comma = dataUrl.indexOf(',');
      resolve({
        image_base64: dataUrl.slice(comma + 1),
        mime_type: file.type || 'image/jpeg',
        filename: file.name,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
