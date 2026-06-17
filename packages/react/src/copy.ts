import type { BugReportCopy } from './types.js';

// Plain American English. Zero em-dashes. Consumer overrides via the `copy`
// prop. nail-inspo overrides with its bubbly voice (kept in nail-inspo's
// copy.bugReport.modal.*). PSBA admin overrides with an admin-tool tone.
export const defaultCopy: BugReportCopy = {
  buttonLabel: 'Report bug',
  heading: 'What happened?',
  descriptionPlaceholder: 'Describe what you saw',
  attachScreenshot: 'Attach a screenshot',
  removeScreenshot: 'Remove',
  send: 'Send',
  sending: 'Sending',
  sent: 'Sent. Thank you.',
  emptyHint: 'Write something or attach a screenshot',
  cancel: 'Cancel',
  rateLimited: 'Too many reports just now. Try again in a few minutes.',
  failure: 'Could not send. Try again.',
  screenshotTooLarge: 'Screenshot too large.',
};
