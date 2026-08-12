import type { ReactNode } from 'react';

type AlertBarProps = {
  /**
   * Optional alert to display. The bar renders as a bare strip when this is
   * absent, so the surface is always present and a future alert component can
   * drop straight in.
   */
  children?: ReactNode;
};

/**
 * Bar pinned to the top of every screen behind login. Mounted by
 * `src/routes/_authed.tsx` only when `VITE_ALERT_BAR_COLOR` is set; its
 * background and resting height come from `.alert-bar` in `src/styles.css`.
 *
 * `aria-hidden` while empty: the strip is decorative chrome on its own, and an
 * unlabelled announced element on every page is noise. Dropped as soon as a
 * child arrives, so the child's own role reaches the accessibility tree.
 */
export const AlertBar = ({ children }: AlertBarProps) => (
  <div className="alert-bar" aria-hidden={children == null ? true : undefined}>
    {children}
  </div>
);
