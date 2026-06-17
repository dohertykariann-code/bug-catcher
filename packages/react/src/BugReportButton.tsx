import { useState, type CSSProperties } from 'react';
import type { BugReportButtonProps } from './types.js';
import { defaultCopy } from './copy.js';
import BugReportModal from './BugReportModal.js';

function cornerStyle(corner: NonNullable<BugReportButtonProps['corner']>): CSSProperties {
  const base: CSSProperties = {
    position: 'fixed',
    zIndex: 60,
    cursor: 'pointer',
  };
  const horizontal = corner.endsWith('right') ? { right: '1rem' } : { left: '1rem' };
  const vertical = corner.startsWith('bottom') ? { bottom: '1rem' } : { top: '1rem' };
  return { ...base, ...horizontal, ...vertical };
}

const buttonStyle: CSSProperties = {
  background: 'var(--bug-catcher-accent, #0a0a0a)',
  color: 'var(--bug-catcher-bg, #ffffff)',
  border: '1px solid var(--bug-catcher-border, #0a0a0a)',
  borderRadius: 'var(--bug-catcher-radius, 999px)',
  padding: '0.5rem 0.875rem',
  fontFamily: 'var(--bug-catcher-font-body, system-ui, sans-serif)',
  fontWeight: 600,
  fontSize: '0.875rem',
  boxShadow: 'var(--bug-catcher-shadow, 0 4px 12px rgba(0,0,0,.2))',
};

export default function BugReportButton(props: BugReportButtonProps) {
  const {
    endpoint,
    corner = 'bottom-right',
    mobileBottomOffset = 0,
    source = 'tech',
    clientSlug,
    authHeader,
    copy: copyOverride,
    onSubmitted,
  } = props;
  const [open, setOpen] = useState(false);
  const copy = { ...defaultCopy, ...copyOverride };
  // CSS custom property carries the mobile-offset add-on. A consumer-supplied
  // stylesheet applies it under a media query, e.g.:
  //   @media (max-width: 767px) {
  //     button[data-bug-catcher-button] { bottom: calc(1rem + var(--bug-catcher-mobile-offset, 0px)); }
  //   }
  // Bundling the media query INTO the component would require either a
  // styled-component runtime or an inline <style> tag. Pushing it to the
  // host stylesheet keeps the runtime zero-dep.
  const inline: CSSProperties & Record<string, string | number> = {
    ...cornerStyle(corner),
    ...buttonStyle,
    ['--bug-catcher-mobile-offset' as string]: `${mobileBottomOffset}px`,
  };

  return (
    <>
      <button
        type="button"
        data-bug-catcher-button
        onClick={() => setOpen(true)}
        style={inline}
      >
        {copy.buttonLabel}
      </button>
      {open && (
        <BugReportModal
          endpoint={endpoint}
          source={source}
          clientSlug={clientSlug}
          authHeader={authHeader}
          copy={copy}
          onClose={() => setOpen(false)}
          onSubmitted={onSubmitted}
        />
      )}
    </>
  );
}
