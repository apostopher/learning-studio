import { LogOut } from 'lucide-react';
import { TooltipIconButton } from './ui/tooltip-icon-button';

type SignOutButtonProps = {
  onSignOut: () => void;
  /** Makes the control inert and swaps its label while the request is in flight. */
  isSigningOut: boolean;
};

/**
 * The icon-only sign-out control, shared by the `/app` header and the course
 * header so the affordance sits in the same place and behaves identically
 * wherever a learner happens to be.
 */
export const SignOutButton = ({
  onSignOut,
  isSigningOut,
}: SignOutButtonProps) => (
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
    className="h-9 w-9 shrink-0"
  >
    <LogOut className="h-4 w-4" aria-hidden="true" />
  </TooltipIconButton>
);
