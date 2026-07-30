import { appTitle } from '../styles/theme.generated';

/** The app's standing footer bar. Shared so the loading skeleton and the real
 *  shell cannot drift apart and cause a layout shift on the swap. */
export const AppShellFooter = () => (
  <div className="flex items-center justify-between h-full ps-4 pe-4 text-secondary text-sm">
    <span>© {appTitle}</span>
  </div>
);
