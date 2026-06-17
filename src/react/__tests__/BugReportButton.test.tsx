import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BugReportButton from '../BugReportButton.js';
import { defaultCopy } from '../copy.js';

describe('BugReportButton', () => {
  it('renders the default button label', () => {
    render(<BugReportButton endpoint="/api/bug-report" />);
    expect(screen.getByRole('button', { name: defaultCopy.buttonLabel })).toBeInTheDocument();
  });

  it('positions at bottom-right by default', () => {
    render(<BugReportButton endpoint="/api/bug-report" />);
    const btn = screen.getByRole('button', { name: defaultCopy.buttonLabel });
    expect(btn).toHaveStyle({ position: 'fixed', right: '1rem', bottom: '1rem' });
  });

  it('honors corner=bottom-left', () => {
    render(<BugReportButton endpoint="/api/bug-report" corner="bottom-left" />);
    const btn = screen.getByRole('button', { name: defaultCopy.buttonLabel });
    expect(btn).toHaveStyle({ position: 'fixed', left: '1rem', bottom: '1rem' });
  });

  it('sets the mobile offset CSS var on the inline style', () => {
    render(<BugReportButton endpoint="/api/bug-report" mobileBottomOffset={76} />);
    const btn = screen.getByRole('button', { name: defaultCopy.buttonLabel });
    expect(btn.getAttribute('style') || '').toContain('--bug-catcher-mobile-offset');
  });

  it('opens the modal on click', async () => {
    const user = userEvent.setup();
    render(<BugReportButton endpoint="/api/bug-report" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: defaultCopy.buttonLabel }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('merges consumer-supplied copy with defaults', () => {
    render(<BugReportButton endpoint="/api/bug-report" copy={{ buttonLabel: 'Tell us' }} />);
    expect(screen.getByRole('button', { name: 'Tell us' })).toBeInTheDocument();
  });
});
