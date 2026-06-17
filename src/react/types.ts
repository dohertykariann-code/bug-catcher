export type BugReportSource = 'tech' | 'client';
export type BugReportCorner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export interface BugReportCopy {
  buttonLabel: string;
  heading: string;
  descriptionPlaceholder: string;
  attachScreenshot: string;
  removeScreenshot: string;
  send: string;
  sending: string;
  sent: string;
  emptyHint: string;
  cancel: string;
  rateLimited: string;
  failure: string;
  screenshotTooLarge: string;
}

export interface BugReportAuthHeader {
  name: string;
  value: string;
}

export interface BugReportButtonProps {
  endpoint: string;
  corner?: BugReportCorner;
  mobileBottomOffset?: number;
  source?: BugReportSource;
  clientSlug?: string;
  authHeader?: BugReportAuthHeader;
  copy?: Partial<BugReportCopy>;
  onSubmitted?: () => void;
}

export interface BugReportModalProps {
  endpoint: string;
  source: BugReportSource;
  clientSlug?: string;
  authHeader?: BugReportAuthHeader;
  copy: BugReportCopy;
  onClose: () => void;
  onSubmitted?: () => void;
}
