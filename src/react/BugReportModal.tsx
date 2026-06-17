import { useEffect, useRef, useState } from 'react';
import type { BugReportModalProps } from './types.js';
import { MAX_FILE_BYTES, readFileAsBase64 } from './upload.js';

interface ScreenshotState {
  base64: string;
  mime: string;
  previewUrl: string;
}

type SendState = 'idle' | 'sending' | 'sent' | 'error';

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 70,
    background: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '1rem',
    overflowY: 'auto' as const,
  },
  panel: {
    background: 'var(--bug-catcher-bg, #ffffff)',
    color: 'var(--bug-catcher-fg, #0a0a0a)',
    border: '2px solid var(--bug-catcher-border, #0a0a0a)',
    borderRadius: 'var(--bug-catcher-radius, 0.75rem)',
    boxShadow: 'var(--bug-catcher-shadow, 0 8px 24px rgba(0,0,0,.25))',
    width: '100%',
    maxWidth: '28rem',
    margin: '2rem 0',
    padding: '1.25rem',
    fontFamily: 'var(--bug-catcher-font-body, system-ui, sans-serif)',
  },
  heading: {
    fontFamily: 'var(--bug-catcher-font-display, var(--bug-catcher-font-body, system-ui, sans-serif))',
    fontSize: '1.5rem',
    margin: '0 0 0.75rem',
  },
  textarea: {
    width: '100%',
    minHeight: '6rem',
    border: '1px solid var(--bug-catcher-border, #0a0a0a)',
    borderRadius: 'var(--bug-catcher-radius, 0.5rem)',
    padding: '0.625rem',
    fontFamily: 'inherit',
    fontSize: '1rem',
    background: 'var(--bug-catcher-bg, #ffffff)',
    color: 'inherit',
    marginBottom: '0.75rem',
    boxSizing: 'border-box' as const,
  },
  btnSecondary: {
    width: '100%',
    background: 'var(--bug-catcher-bg, #ffffff)',
    color: 'var(--bug-catcher-fg, #0a0a0a)',
    border: '1px solid var(--bug-catcher-border, #0a0a0a)',
    borderRadius: 'var(--bug-catcher-radius, 0.5rem)',
    padding: '0.625rem 1rem',
    fontFamily: 'inherit',
    fontSize: '1rem',
    cursor: 'pointer',
    marginBottom: '0.5rem',
  },
  btnPrimary: {
    width: '100%',
    background: 'var(--bug-catcher-accent, #0a0a0a)',
    color: 'var(--bug-catcher-bg, #ffffff)',
    border: '1px solid var(--bug-catcher-border, #0a0a0a)',
    borderRadius: 'var(--bug-catcher-radius, 0.5rem)',
    padding: '0.75rem 1rem',
    fontFamily: 'var(--bug-catcher-font-display, inherit)',
    fontSize: '1.125rem',
    cursor: 'pointer',
    marginBottom: '0.5rem',
  },
  alert: {
    color: '#b00020',
    fontWeight: 600,
    fontSize: '0.875rem',
    margin: '0 0 0.75rem',
  },
  thumbRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  thumb: {
    width: '4rem',
    height: '4rem',
    objectFit: 'cover' as const,
    border: '1px solid var(--bug-catcher-border, #0a0a0a)',
    borderRadius: 'var(--bug-catcher-radius, 0.5rem)',
  },
};

export default function BugReportModal(props: BugReportModalProps) {
  const { endpoint, source, clientSlug, authHeader, copy, onClose, onSubmitted } = props;
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<ScreenshotState | null>(null);
  const [state, setState] = useState<SendState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '',
  );

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const url = screenshot?.previewUrl;
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

  const canSend = description.trim().length > 0 || screenshot !== null;
  const sendLabel =
    state === 'sending' ? copy.sending : state === 'sent' ? copy.sent : canSend ? copy.send : copy.emptyHint;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setErrorMessage(copy.screenshotTooLarge);
      return;
    }
    const result = await readFileAsBase64(file);
    setScreenshot({
      base64: result.image_base64,
      mime: result.mime_type || 'image/jpeg',
      previewUrl: URL.createObjectURL(file),
    });
  }

  async function handleSend() {
    if (!canSend || state === 'sending') return;
    setState('sending');
    setErrorMessage(null);
    const payload = {
      source,
      description: description.trim(),
      screenshot_base64: screenshot?.base64,
      screenshot_mime: screenshot?.mime,
      client_slug: source === 'client' ? clientSlug : undefined,
      url_path: typeof window !== 'undefined' ? window.location.pathname : '',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      idempotency_key: idempotencyKeyRef.current || undefined,
    };
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (authHeader) headers[authHeader.name] = authHeader.value;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (res.status === 429) {
        setState('error');
        setErrorMessage(copy.rateLimited);
        return;
      }
      if (!res.ok) {
        setState('error');
        setErrorMessage(copy.failure);
        return;
      }
      setState('sent');
      if (onSubmitted) onSubmitted();
      setTimeout(onClose, 2000);
    } catch {
      setState('error');
      setErrorMessage(copy.failure);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="bug-report-heading" style={styles.backdrop} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h2 id="bug-report-heading" style={styles.heading}>{copy.heading}</h2>
        <textarea
          ref={textareaRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={copy.descriptionPlaceholder}
          style={styles.textarea}
        />
        {!screenshot ? (
          <>
            <button type="button" onClick={() => fileInputRef.current?.click()} style={styles.btnSecondary}>
              {copy.attachScreenshot}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          </>
        ) : (
          <div style={styles.thumbRow}>
            <img src={screenshot.previewUrl} alt="" style={styles.thumb} />
            <button type="button" onClick={() => setScreenshot(null)} style={{ ...styles.btnSecondary, width: 'auto', marginBottom: 0 }}>
              {copy.removeScreenshot}
            </button>
          </div>
        )}
        {errorMessage && (
          <p style={styles.alert} role="alert">{errorMessage}</p>
        )}
        <button type="button" onClick={handleSend} disabled={!canSend || state === 'sending'} style={{ ...styles.btnPrimary, opacity: !canSend || state === 'sending' ? 0.6 : 1 }}>
          {sendLabel}
        </button>
        <button type="button" onClick={onClose} style={styles.btnSecondary}>
          {copy.cancel}
        </button>
      </div>
    </div>
  );
}
