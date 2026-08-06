import { and, eq, inArray } from 'drizzle-orm';
import { db } from '#/db';
import {
  rolePermissionsTable,
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
} from '#/db/schema';
import { OWNER_ROLE, permissionKey } from '#/lib/admin-schemas';

/**
 * Every permission held by a user, as `entity:action` strings.
 *
 * An owner short-circuits to `['*']` — it bypasses permission checks entirely,
 * so enumerating grants for it would be misleading configuration.
 *
 * Kept free of server-only imports: the client needs this set to decide which
 * controls to render, and it reaches this module through `getAuthContext`.
 */
export async function getUserPermissions(
  roles: string[],
): Promise<Set<string>> {
  if (roles.includes(OWNER_ROLE)) return new Set(['*']);
  if (roles.length === 0) return new Set();

  const rows = await db
    .select({
      entity: rolePermissionsTable.entity,
      action: rolePermissionsTable.action,
    })
    .from(rolePermissionsTable)
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, rolePermissionsTable.roleId),
    )
    .where(inArray(userRolesTable.name, roles));

  return new Set(rows.map((r) => permissionKey(r.entity, r.action)));
}

/** `'*'` is the owner's wildcard — see `getUserPermissions`. */
export function hasPermission(
  permissions: Set<string> | string[],
  entity: string,
  action: string,
): boolean {
  const set =
    permissions instanceof Set ? permissions : new Set<string>(permissions);
  return set.has('*') || set.has(permissionKey(entity, action));
}

/** Role names held by a target user — used to protect privileged accounts. */
export async function getRoleNamesForProfile(
  profileId: number,
): Promise<string[]> {
  const rows = await db
    .select({ name: userRolesTable.name })
    .from(userProfileRolesTable)
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, userProfileRolesTable.roleId),
    )
    .where(eq(userProfileRolesTable.userProfileId, profileId));
  return rows.map((r) => r.name);
}

/** All roles, for the owner's role-assignment UI. */
export async function listRoles(): Promise<
  { id: number; name: string; description: string | null }[]
> {
  return db
    .select({
      id: userRolesTable.id,
      name: userRolesTable.name,
      description: userRolesTable.description,
    })
    .from(userRolesTable)
    .orderBy(userRolesTable.id);
}

/** Permissions granted to each role, keyed by role name. */
export async function listRolePermissions(): Promise<Record<string, string[]>> {
  const rows = await db
    .select({
      role: userRolesTable.name,
      entity: rolePermissionsTable.entity,
      action: rolePermissionsTable.action,
    })
    .from(rolePermissionsTable)
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, rolePermissionsTable.roleId),
    );

  const byRole: Record<string, string[]> = {};
  for (const row of rows) {
    const list = byRole[row.role] ?? [];
    list.push(permissionKey(row.entity, row.action));
    byRole[row.role] = list;
  }
  return byRole;
}

/**
 * Grant or revoke one permission on a role.
 *
 * Refuses `owner`: it bypasses checks, so a row would be a control that does
 * nothing — and a UI that appears to configure it would be lying.
 */
export async function setRolePermission(options: {
  roleName: string;
  entity: string;
  action: string;
  granted: boolean;
}): Promise<{ ok: true } | { ok: false; reason: 'not-found' | 'owner' }> {
  const { roleName, entity, action, granted } = options;
  if (roleName === OWNER_ROLE) return { ok: false, reason: 'owner' };

  const [role] = await db
    .select({ id: userRolesTable.id })
    .from(userRolesTable)
    .where(eq(userRolesTable.name, roleName))
    .limit(1);
  if (!role) return { ok: false, reason: 'not-found' };

  if (granted) {
    await db
      .insert(rolePermissionsTable)
      .values({ roleId: role.id, entity, action })
      .onConflictDoNothing();
  } else {
    await db
      .delete(rolePermissionsTable)
      .where(
        and(
          eq(rolePermissionsTable.roleId, role.id),
          eq(rolePermissionsTable.entity, entity),
          eq(rolePermissionsTable.action, action),
        ),
      );
  }
  return { ok: true };
}

/** How many people currently hold a role — the last-owner guard reads this. */
export async function countRoleHolders(roleName: string): Promise<number> {
  const rows = await db
    .select({ profileId: userProfileRolesTable.userProfileId })
    .from(userProfileRolesTable)
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, userProfileRolesTable.roleId),
    )
    .where(eq(userRolesTable.name, roleName));
  return rows.length;
}

export type RoleChangeResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'last-owner' };

/**
 * Assign or revoke a role for a user. Owner-only at the route layer — this is
 * deliberately not reachable through any grantable permission.
 *
 * Revoking runs inside a transaction with the owner count, so two concurrent
 * demotions can't both observe "there are 2 owners" and leave zero: with no
 * owner nobody can ever grant a role again, recoverable only from a terminal.
 */
export async function setUserRole(options: {
  profileId: number;
  roleName: string;
  granted: boolean;
  actorUserId: string;
}): Promise<RoleChangeResult> {
  const { profileId, roleName, granted, actorUserId } = options;

  const [role] = await db
    .select({ id: userRolesTable.id })
    .from(userRolesTable)
    .where(eq(userRolesTable.name, roleName))
    .limit(1);
  if (!role) return { ok: false, reason: 'not-found' };

  const [profile] = await db
    .select({ id: userProfileTable.id })
    .from(userProfileTable)
    .where(eq(userProfileTable.id, profileId))
    .limit(1);
  if (!profile) return { ok: false, reason: 'not-found' };

  if (granted) {
    await db
      .insert(userProfileRolesTable)
      .values({
        userProfileId: profileId,
        roleId: role.id,
        assignedBy: actorUserId,
      })
      .onConflictDoNothing();
    return { ok: true };
  }

  return db.transaction(async (tx) => {
    if (roleName === OWNER_ROLE) {
      const holders = await tx
        .select({ profileId: userProfileRolesTable.userProfileId })
        .from(userProfileRolesTable)
        .where(eq(userProfileRolesTable.roleId, role.id));
      if (holders.length <= 1) {
        return { ok: false, reason: 'last-owner' } as const;
      }
    }
    await tx
      .delete(userProfileRolesTable)
      .where(
        and(
          eq(userProfileRolesTable.userProfileId, profileId),
          eq(userProfileRolesTable.roleId, role.id),
        ),
      );
    return { ok: true } as const;
  });
}
