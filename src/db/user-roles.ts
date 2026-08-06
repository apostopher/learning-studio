import { eq } from 'drizzle-orm';
import { db } from '#/db';
import {
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
} from '#/db/schema';

/**
 * Role names assigned to an auth user (empty if no profile or no roles).
 *
 * Lives here rather than in `#/db/admin` because it is the one query the
 * *client* graph needs: `__root.tsx` → `auth-functions.ts` reaches it on every
 * page load to build the router context. `admin.ts` imports `crypto.server`,
 * `resolve.server` and `posters.server`, so pulling this from there drags all
 * of it into the client bundle and the build's import-protection rejects it.
 *
 * Keep this module free of server-only imports for that reason.
 */
export async function getUserRoleNames(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: userRolesTable.name })
    .from(userProfileTable)
    .innerJoin(
      userProfileRolesTable,
      eq(userProfileRolesTable.userProfileId, userProfileTable.id),
    )
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, userProfileRolesTable.roleId),
    )
    .where(eq(userProfileTable.userId, userId));

  return rows.map((r) => r.name);
}
