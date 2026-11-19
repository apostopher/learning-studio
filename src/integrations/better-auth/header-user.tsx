import { Link } from '@tanstack/react-router';
import { authClient } from '#/lib/auth-client';

export default function BetterAuthHeader() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (session?.user) {
    return <div>User</div>;
  }

  return <Link to="/auth/login">Sign in</Link>;
}
