import { getUserRoleNames } from '@/db/admin';
import { auth } from '@/lib/auth';
import { ADMIN_ROLE } from '@/lib/admin-schemas';

export class ForbiddenError extends Error {
  constructor() {
    super('Forbidden');
    this.name = 'ForbiddenError';
  }
}

/** Server-only admin guard. Every admin API handler must call this first. */
export async function requireAdmin(
  headers: Headers,
): Promise<{ userId: string; roles: string[] }> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();
  const roles = await getUserRoleNames(userId);
  if (!roles.includes(ADMIN_ROLE)) throw new ForbiddenError();
  return { userId, roles };
}
