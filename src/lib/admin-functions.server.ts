import { getRequestHeaders } from '@tanstack/react-start/server';
import { getUserRoleNames } from '@/db/admin';
import { auth } from '@/lib/auth';

const ADMIN_ROLE = 'admin';

export class ForbiddenError extends Error {
  constructor() {
    super('Forbidden');
    this.name = 'ForbiddenError';
  }
}

/**
 * Shared server-side guard. Every admin server fn must call this first so a
 * direct RPC from a non-admin is rejected regardless of any route guard.
 */
export async function requireAdmin(): Promise<{
  userId: string;
  roles: string[];
}> {
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();
  const roles = await getUserRoleNames(userId);
  if (!roles.includes(ADMIN_ROLE)) throw new ForbiddenError();
  return { userId, roles };
}
