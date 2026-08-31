import { LogoLink } from './logo-link';
import { SignOutButton } from './sign-out-button';

type AppHeaderProps = {
  onSignOut: () => void;
  /** Disables the control and swaps its label while the request is in flight. */
  isSigningOut: boolean;
};

/**
 * The header for the signed-in course list at `/app`.
 *
 * Edge to edge, with the same 1rem inline padding the rest of the chrome uses,
 * rather than `content-grid`.
 *
 * It used to share `content-grid`'s rails with the page body so the logo lined
 * up with the heading below it. That held while every screen was a centred
 * document. It stopped holding once the app grew full-width tools: the
 * knowledge library editor spans the viewport, so on a wide monitor a header
 * capped at 1500px floated in the middle of a bar whose content ran to both
 * edges. Below 1532px nothing changes at all — `content-grid`'s own
 * `--padding-inline` is 1rem, which is what `px-4` is — so this only affects
 * the widths where the mismatch was visible.
 *
 * The tradeoff, stated plainly: on the screens that ARE centred documents
 * (`/app`, the course list, People) the header no longer shares rails with the
 * body above 1500px. Consistent chrome across every screen was judged worth
 * more than per-page alignment on the wide ones.
 *
 * The course routes get their header from `AppShell` instead, which carries a
 * sidebar and footer this page has no use for.
 */
export const AppHeader = ({ onSignOut, isSigningOut }: AppHeaderProps) => (
  <header className="app-header border-gray-6 border-b bg-gray-2">
    <div className="flex items-center justify-between gap-4 px-4 py-4">
      {/* Logo slot. The mark itself comes from the generated theme, so
          rebranding is an env change rather than a code change. It links to
          /app — a self-link on this page, and the way back from admin. */}
      <LogoLink />

      <SignOutButton onSignOut={onSignOut} isSigningOut={isSigningOut} />
    </div>
  </header>
);
