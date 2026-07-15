import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { getUserRoleNames, listAdminCourses } from '@/db/admin';
import { auth } from '@/lib/auth';

const ADMIN_ROLE = 'admin';

type RequestHeaders = ReturnType<typeof getRequestHeaders>;

/**
 * Shared server-side guard. Every admin server fn must call this first so a
 * direct RPC from a non-admin is rejected regardless of any route guard.
 */
export async function requireAdmin(
  headers: RequestHeaders,
): Promise<{ userId: string; roles: string[] }> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new Error('Forbidden');
  const roles = await getUserRoleNames(userId);
  if (!roles.includes(ADMIN_ROLE)) throw new Error('Forbidden');
  return { userId, roles };
}

/** Route-guard probe: resolves for admins, rejects otherwise. */
export const ensureAdmin = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { roles } = await requireAdmin(getRequestHeaders());
    return { roles };
  },
);

/** Admin-only: all courses with counts. Self-guarded. */
export const listAdminCoursesFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdmin(getRequestHeaders());
    return listAdminCourses();
  },
);
