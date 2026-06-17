import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BugReportModal from '../BugReportModal.js';
import { defaultCopy } from '../copy.js';

const baseProps = {
  endpoint: '/api/bug-report',
  source: 'tech' as const,
  copy: defaultCopy,
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.restoreAllMocks();
  baseProps.onClose = vi.fn();
});

describe('BugReportModal', () => {
  it('renders heading and focuses the textarea', () => {
    render(<BugReportModal {...baseProps} />);
    expect(screen.getByRole('heading', { name: defaultCopy.heading })).toBeInTheDocument();
    expect(document.activeElement?.tagName).toBe('TEXTAREA');
  });

  it('disables Send when description and screenshot are both blank', () => {
    render(<BugReportModal {...baseProps} />);
    expect(screen.getByRole('button', { name: defaultCopy.emptyHint })).toBeDisabled();
  });

  it('enables Send when description is non-empty', async () => {
    const user = userEvent.setup();
    render(<BugReportModal {...baseProps} />);
    await user.type(screen.getByRole('textbox'), 'thing broke');
    expect(screen.getByRole('button', { name: defaultCopy.send })).toBeEnabled();
  });

  it('submits and shows Sent on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<BugReportModal {...baseProps} onSubmitted={onSubmitted} />);
    await user.type(screen.getByRole('textbox'), 'thing broke');
    await user.click(screen.getByRole('button', { name: defaultCopy.send }));
    await waitFor(() => expect(screen.getByRole('button', { name: defaultCopy.sent })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalled();
    expect(onSubmitted).toHaveBeenCalled();
  });

  it('shows rateLimited copy when API returns 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'rate_limited' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<BugReportModal {...baseProps} />);
    await user.type(screen.getByRole('textbox'), 'thing broke');
    await user.click(screen.getByRole('button', { name: defaultCopy.send }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(defaultCopy.rateLimited));
  });

  it('shows failure copy on 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'sheets_write_failed' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<BugReportModal {...baseProps} />);
    await user.type(screen.getByRole('textbox'), 'thing broke');
    await user.click(screen.getByRole('button', { name: defaultCopy.send }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(defaultCopy.failure));
  });

  it('calls onClose when Cancel clicked', async () => {
    const user = userEvent.setup();
    render(<BugReportModal {...baseProps} />);
    await user.click(screen.getByRole('button', { name: defaultCopy.cancel }));
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it('shows screenshotTooLarge when file exceeds MAX_FILE_BYTES', async () => {
    render(<BugReportModal {...baseProps} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [big] } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(defaultCopy.screenshotTooLarge));
  });
});
