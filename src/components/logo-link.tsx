import { Link } from '@tanstack/react-router';
import { cn } from '../lib/cn';
import { appTitle } from '../styles/theme.generated';
import { Logo } from './logo';

/**
 * Sizing lives here rather than at each call site so `/app`, the admin
 * screens, and the course shell cannot drift apart.
 */
const LOGO_CLASSNAME =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center';

/**
 * The logo as a link home, shared by `AppHeader` and the course shell's
 * `headerAside` slot so the mark sits at the inline-start edge and behaves
 * identically on every authenticated screen.
 *
 * `Logo` already carries `role="img"` and `aria-label={appTitle}`. Nesting
 * that inside a link would announce the name twice, so the wrapper hides it
 * from the accessibility tree and the link owns the accessible name.
 */
export const LogoLink = ({ className }: { className?: string }) => (
  <Link
    to="/app"
    aria-label={`${appTitle}, home`}
    className={cn(
      'rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9',
      className,
    )}
  >
    <span aria-hidden="true">
      <Logo className={LOGO_CLASSNAME} />
    </span>
  </Link>
);
