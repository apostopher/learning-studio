import { ensureUserProfile } from '#/db/user-profile';
import { getUserRoleNames } from '#/db/user-roles';
import { auth } from '#/lib/auth';

/**
 * Session plus role names, and the repair half of profile creation.
 *
 * **This module must only ever be reached from inside a `createServerFn`
 * handler, via dynamic `import()`.** It pulls in the database layer, and the
 * TanStack compiler only strips server-only imports whose use is confined to a
 * handler body. As a plain function exported from `auth-functions.ts` — which
 * `__root.tsx` imports — it put drizzle and `db/index.ts` into the *client*
 * bundle, where `drizzle(undefined)` threw during module evaluation and took
 * the whole router down: the URL changed and nothing rendered.
 *
 * The `.server.ts` suffix is the guard: the build's import-protection denies
 * server-suffixed modules in the client environment, so a future static import
 * from client-reachable code fails the build instead of shipping silently.
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
