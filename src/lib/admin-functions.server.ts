import { getUserRoleNames } from '#/db/user-roles';
import { auth } from '#/lib/auth';
import { hasAdminAccess } from '#/lib/admin-schemas';

export class ForbiddenError extends Error {
  constructor() {
    super('Forbidden');
    this.name = 'ForbiddenError';
  }
}

/**
 * Server-only admin guard. Every admin API handler must call this first.
 *
 * Accepts admin **or** owner: owner is a superuser, so widening here is what
 * keeps all 34 content routes untouched and avoids giving owners a duplicate
 * `admin` role row that could be revoked independently.
 */
export async function requireAdmin(
  headers: Headers,
): Promise<{ userId: string; roles: string[] }> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();
  const roles = await getUserRoleNames(userId);
  if (!hasAdminAccess(roles)) throw new ForbiddenError();
  return { userId, roles };
}
