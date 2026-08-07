import { LogOut } from 'lucide-react';
import { Logo } from './logo';
import { TooltipIconButton } from './ui/tooltip-icon-button';

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

      <TooltipIconButton
        // The label is the accessible name as well as the tooltip text, so the
        // pending state is announced, not just drawn.
        label={isSigningOut ? 'Signing out…' : 'Sign out'}
        onClick={onSignOut}
        disabled={isSigningOut}
        variant="danger"
        // Overrides the 28px admin-toolbar default: this is a primary,
        // touch-reachable control, and 36px keeps it above the comfortable
        // minimum without dominating the header.
        className="h-9 w-9"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </TooltipIconButton>
    </div>
  </header>
);
