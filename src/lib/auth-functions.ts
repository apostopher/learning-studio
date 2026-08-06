import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { ensureUserProfile } from '#/db/user-profile';
import { getUserRoleNames } from '#/db/user-roles';
import { auth } from '#/lib/auth';

export const getSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });

    return session;
  },
);

export const ensureSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });

    if (!session) {
      throw new Error('Unauthorized');
    }

    return session;
  },
);

/**
 * Session plus role names, and the repair half of profile creation.
 *
 * A plain function rather than the server fn itself so it can be tested
 * directly — the thing worth asserting is that the profile-ensure receives
 * this session's user, which is invisible from the outside.
 *
 * The ensure runs before roles are read, because `getUserRoleNames` joins
 * `user_profiles`: without a row it returns `[]`, which is indistinguishable
 * from "has no roles" and would silently strip an admin of their access.
 *
 * Failures are swallowed. This is the fallback path, not the primary one (the
 * sign-in hook is), and a transient write error must not take down every
 * authenticated page load.
 */
export async function resolveAuthContext(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) return { session, roles: [] as string[] };

  await ensureUserProfile(userId, session.user.email).catch((error) => {
    console.error(`Failed to ensure a user profile for ${userId}`, error);
  });

  const roles = await getUserRoleNames(userId).catch(() => [] as string[]);
  return { session, roles };
}

/** Session plus the user's role names, for the root router context. */
export const getAuthContext = createServerFn({ method: 'GET' }).handler(
  async () => resolveAuthContext(getRequestHeaders()),
);
