import { isAnyCourseStaff } from '#/db/course-staff';
import { isAnyDisciplineStaff } from '#/db/discipline-staff';
import { getUserPermissions } from '#/db/permissions';
import { ensureUserProfile } from '#/db/user-profile';
import { getUserRoleNames } from '#/db/user-roles';
import { hasAdminAccess } from '#/lib/admin-schemas';
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
 *
 * `isStaffAnywhere` and `isCourseStaffAnywhere` ride alongside `roles` and
 * `permissions` because staff-table membership is invisible to both: a subject
 * expert holds no global role and no global grant, so a route guard reading
 * only those two cannot tell them apart from an ordinary learner.
 *
 * They are two fields and not one because the router asks two different
 * questions of them — see `__root.tsx`'s context type for each field's
 * meaning, and `_authed/admin.tsx` for the two readers. Both are deliberately
 * booleans and not lists of ids: which course or discipline is a per-request,
 * server-side decision that `requireCoursePermission` and
 * `requireLessonContentPermission` own.
 */
export async function resolveAuthContext(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) {
    return {
      session,
      roles: [] as string[],
      permissions: [] as string[],
      isStaffAnywhere: false,
      isCourseStaffAnywhere: false,
    };
  }

  await ensureUserProfile(userId, session.user.email).catch((error) => {
    console.error(`Failed to ensure a user profile for ${userId}`, error);
  });

  const roles = await getUserRoleNames(userId).catch(() => [] as string[]);
  // Serialised as an array because router context crosses the wire; the client
  // rebuilds a Set only where it matters. `['*']` means owner — see
  // `getUserPermissions`.
  const [permissions, staffing] = await Promise.all([
    getUserPermissions(roles)
      .then((set) => [...set])
      .catch(() => [] as string[]),
    resolveStaffing(roles, userId),
  ]);
  return { session, roles, permissions, ...staffing };
}

/**
 * The two staffing booleans the router context carries, resolved together.
 *
 * Mirrors `permissions.server.ts`'s `isStaffAnywhere` for the union — same
 * three sources, same short-circuit order (admin, then `course_staff`, then
 * `discipline_staff`), so a course-staff hit never issues the discipline
 * query. It cannot simply CALL that helper: this module already holds the
 * session and the role names, and the helper re-derives both from headers.
 *
 * One deliberate deviation from that ordering: the `course_staff` lookup runs
 * even for an admin, where the union alone would have short-circuited past it.
 * `isCourseStaffAnywhere` means "holds a `course_staff` row", full stop — an
 * admin who staffs no course does not hold one, and answering `true` for them
 * on the strength of their global role would make the field a synonym for the
 * union it exists to be distinguished from. The nav link it drives is already
 * shown to an admin by their `course:read` grant.
 *
 * Every lookup fails closed, exactly like the roles and permissions lookups
 * beside it: a transient error must hide the admin console, never open it.
 */
async function resolveStaffing(
  roles: string[],
  userId: string,
): Promise<{ isStaffAnywhere: boolean; isCourseStaffAnywhere: boolean }> {
  const isCourseStaffAnywhere = await isAnyCourseStaff(userId).catch(
    () => false,
  );
  const isStaffAnywhere =
    hasAdminAccess(roles) ||
    isCourseStaffAnywhere ||
    (await isAnyDisciplineStaff(userId).catch(() => false));
  return { isStaffAnywhere, isCourseStaffAnywhere };
}
