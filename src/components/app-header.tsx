import { Logo } from './logo';
import { SignOutButton } from './sign-out-button';

type AppHeaderProps = {
  onSignOut: () => void;
  /** Disables the control and swaps its label while the request is in flight. */
  isSigningOut: boolean;
};

/**
 * The header for the signed-in course list at `/app`.
 *
 * `content-grid` rather than a plain flex row so the logo and the sign-out
 * button sit on the SAME vertical rails as the "My Courses" heading below —
 * the page body already uses `.content`, and a header with its own padding
 * would sit a few pixels off from it at every breakpoint.
 *
 * The course routes get their header from `AppShell` instead, which carries a
 * sidebar and footer this page has no use for.
 */
export const AppHeader = ({ onSignOut, isSigningOut }: AppHeaderProps) => (
  <header className="content-grid border-b border-gray-6 bg-gray-2">
    <div className="content flex h-14 items-center justify-between gap-4">
      {/* Logo slot. The mark itself comes from the generated theme, so
          rebranding is an env change rather than a code change. */}
      <Logo className="inline-flex h-8 w-8 shrink-0 items-center justify-center" />

      <SignOutButton onSignOut={onSignOut} isSigningOut={isSigningOut} />
    </div>
  </header>
);
