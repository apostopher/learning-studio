import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { authClient } from '#/lib/auth-client';

/**
 * Ends the session and returns the learner to the login screen.
 *
 * The ORDER of the three steps below is load-bearing:
 *
 * 1. `queryClient.clear()` — every cached query here is user-scoped (courses,
 *    progress, chats). Leaving them in memory means the next person to sign in
 *    on this browser can be served the previous user's data from cache before
 *    their own fetch resolves. Clear, not `invalidate`: invalidation keeps the
 *    stale data around and re-serves it while refetching.
 *
 * 2. `router.invalidate()` — the session lives in the ROUTER CONTEXT, resolved
 *    once in `__root.tsx`'s `beforeLoad`. Without re-running it the context
 *    still holds the signed-in session, and `/auth/login`'s own `beforeLoad`
 *    ("if `context.session`, redirect to `/app`") would bounce us straight
 *    back to the page we just signed out of. Awaited, so the navigation below
 *    sees the cleared context rather than racing it.
 *
 * 3. `navigate()` — explicit rather than relying on `_authed`'s redirect to
 *    fire as a side effect of the invalidation. Being deliberate about the
 *    destination means this keeps working if the guard's behaviour changes.
 *
 * The mutation deliberately has no `onError` cache-restore: if `signOut` fails
 * the server-side session may or may not have been destroyed, and the safe
 * reading of an ambiguous auth state is "signed out". The error surfaces
 * through `isError` so the caller can tell the user.
 */
export const useSignOut = () => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async () => {
      await authClient.signOut();
    },
    onSuccess: async () => {
      queryClient.clear();
      await router.invalidate();
      await navigate({ to: '/auth/login', search: {} });
    },
  });
};
