import {
  getRoleNamesForProfile,
  getUserPermissions,
  hasPermission,
} from '#/db/permissions';
import { getUserRoleNames } from '#/db/user-roles';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  hasAdminAccess,
  OWNER_ROLE,
  type PermissionAction,
  type PermissionEntity,
} from '#/lib/admin-schemas';
import { auth } from '#/lib/auth';

export interface PermittedActor {
  userId: string;
  roles: string[];
  permissions: Set<string>;
  isOwner: boolean;
}

/**
 * Server-only permission guard. Every user/enrolment handler calls this first.
 *
 * Mirrors `requireAdmin` — same `ForbiddenError`, same self-guarding shape —
 * rather than returning a permission set for the caller to inspect: a handler
 * that forgets to check what it was handed silently allows everything, which
 * is the exact failure guards exist to prevent.
 *
 * An owner bypasses the permission lookup entirely.
 */
export async function requirePermission(
  headers: Headers,
  entity: PermissionEntity,
  action: PermissionAction,
): Promise<PermittedActor> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();

  const roles = await getUserRoleNames(userId);
  // Admin-or-owner is the floor: permissions refine what an admin may do, they
  // never grant the admin surface to someone who isn't one.
  if (!hasAdminAccess(roles)) throw new ForbiddenError();

  const permissions = await getUserPermissions(roles);
  if (!hasPermission(permissions, entity, action)) throw new ForbiddenError();

  return {
    userId,
    roles,
    permissions,
    isOwner: roles.includes(OWNER_ROLE),
  };
}

/** Owner-only guard, for role assignment and permission editing. */
export async function requireOwner(
  headers: Headers,
): Promise<{ userId: string; roles: string[] }> {
  const session = await auth.api.getSession({ headers });
  const userId = session?.user?.id;
  if (!userId) throw new ForbiddenError();
  const roles = await getUserRoleNames(userId);
  if (!roles.includes(OWNER_ROLE)) throw new ForbiddenError();
  return { userId, roles };
}

/**
 * Refuse an action aimed at a privileged account unless the actor is an owner.
 *
 * A permission grants power over ordinary learners only. Without this, an admin
 * holding `user:update` could rewrite an owner's record — the delegation
 * boundary has to hold on the *target* as well as the actor.
 */
export async function assertCanActOnProfile(
  actor: PermittedActor,
  targetProfileId: number,
): Promise<void> {
  if (actor.isOwner) return;
  const targetRoles = await getRoleNamesForProfile(targetProfileId);
  if (targetRoles.length > 0) throw new ForbiddenError();
}
