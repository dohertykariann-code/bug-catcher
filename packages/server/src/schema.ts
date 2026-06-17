import { z } from 'zod';

// Body shape ported from nail-inspo server/routes/feedback.js:39-52.
// tech_id is omitted on purpose: the handler derives user_id from the
// consumer's isAuthed() callback, not from the body. A body-supplied
// tech_id would let an attacker forge another user's id into the row.
export const bugReportSchema = z.object({
  source: z.enum(['tech', 'client']),
  description: z.string().max(10_000).optional().default(''),
  screenshot_base64: z.string().optional(),
  screenshot_mime: z.string().optional(),
  client_slug: z.string().optional(),
  url_path: z.string().max(2_000).default(''),
  user_agent: z.string().default(''),
  idempotency_key: z.string().uuid().optional(),
});

export type BugReportBody = z.infer<typeof bugReportSchema>;
