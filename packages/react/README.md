# @kari/bug-catcher-react

Floating "Report bug" button + modal. Zero brand defaults. Consumer drives visuals via CSS custom properties.

## Install

See `~/Projects/bug-catcher/README.md` for git-install setup.

## CSS variables

Set these on the host page (`:root`, `body`, or a wrapping container):

| Variable | Purpose | Example |
|---|---|---|
| `--bug-catcher-bg` | Modal + button fill | `#ffffff` |
| `--bug-catcher-fg` | Text | `#0a0a0a` |
| `--bug-catcher-accent` | Send button | `#c4541a` |
| `--bug-catcher-border` | Border color | `#0a0a0a` |
| `--bug-catcher-radius` | Corner radius | `0.5rem` |
| `--bug-catcher-shadow` | Shadow (can be `none`) | `0 4px 12px rgba(0,0,0,.2)` |
| `--bug-catcher-font-display` | Heading font | `'Source Serif', serif` |
| `--bug-catcher-font-body` | Body font | `'Inter', sans-serif` |

## Usage

```tsx
import { BugReportButton } from '@kari/bug-catcher-react';

export default function AdminLayout({ children }) {
  return (
    <>
      {children}
      <BugReportButton
        endpoint="/api/bug-report"
        corner="bottom-right"
        copy={{ buttonLabel: 'Report bug' }}
      />
    </>
  );
}
```

### Mobile offset stack (consumer-side CSS)

If another fixed element occupies the corner on mobile, set the offset prop and add this rule to your global CSS:

```css
@media (max-width: 767px) {
  button[data-bug-catcher-button] {
    bottom: calc(1rem + var(--bug-catcher-mobile-offset, 0px));
  }
}
```
