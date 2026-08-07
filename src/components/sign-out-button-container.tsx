import { useSignOut } from '#/data-hooks/use-sign-out';
import { SignOutButton } from './sign-out-button';

/**
 * Drop-in sign-out control for surfaces that compose their own header rather
 * than using `AppHeader` — currently the course layout, whose header comes
 * from `AppShell`.
 */
export const SignOutButtonContainer = () => {
  const signOut = useSignOut();

  return (
    <SignOutButton
      onSignOut={() => signOut.mutate()}
      isSigningOut={signOut.isPending}
    />
  );
};
