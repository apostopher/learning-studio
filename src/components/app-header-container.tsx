import { useSignOut } from '#/data-hooks/use-sign-out';
import { AppHeader } from './app-header';

/**
 * Owns the sign-out mutation and hands `AppHeader` the two values it renders
 * from. Kept separate so `AppHeader` stays a pure props-to-JSX component that
 * can be rendered in a test without a query client.
 */
export const AppHeaderContainer = () => {
  const signOut = useSignOut();

  return (
    <AppHeader
      onSignOut={() => signOut.mutate()}
      isSigningOut={signOut.isPending}
    />
  );
};
