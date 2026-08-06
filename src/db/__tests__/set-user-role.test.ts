// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', async () => {
  const { integer, pgTable, varchar } = await import('drizzle-orm/pg-core');
  return {
    rolePermissionsTable: pgTable('role_permissions', {
      id: integer('id').primaryKey(),
      roleId: integer('role_id'),
      entity: varchar('entity', { length: 50 }),
      action: varchar('action', { length: 20 }),
    }),
    userProfileRolesTable: pgTable('user_profile_roles', {
      userProfileId: integer('user_profile_id'),
      roleId: integer('role_id'),
      assignedBy: varchar('assigned_by', { length: 255 }),
    }),
    userProfileTable: pgTable('user_profiles', {
      id: integer('id').primaryKey(),
    }),
    userRolesTable: pgTable('user_roles', {
      id: integer('id').primaryKey(),
      name: varchar('name', { length: 100 }),
    }),
  };
});

import { setUserRole } from '#/db/permissions';

function reader(result: unknown) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(result),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  // role lookup, then profile lookup
  db.select
    .mockReturnValueOnce(reader([{ id: 2 }]))
    .mockReturnValueOnce(reader([{ id: 5 }]));
});

/**
 * With role assignment owner-only, zero owners means nobody can ever grant a
 * role again — recoverable only from a terminal with DB access. The count and
 * the delete therefore have to see the same snapshot.
 */
describe('setUserRole — last-owner guard', () => {
  it('refuses to remove the only owner', async () => {
    const deleteFn = vi.fn();
    db.transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn({
        select: () => reader([{ profileId: 5 }]), // exactly one holder
        delete: deleteFn,
      }),
    );

    const result = await setUserRole({
      profileId: 5,
      roleName: 'owner',
      granted: false,
      actorUserId: 'owner-1',
    });

    expect(result).toEqual({ ok: false, reason: 'last-owner' });
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('allows removing an owner while another remains', async () => {
    const whereFn = vi.fn().mockResolvedValue(undefined);
    db.transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn({
        select: () => reader([{ profileId: 5 }, { profileId: 6 }]),
        delete: () => ({ where: whereFn }),
      }),
    );

    const result = await setUserRole({
      profileId: 5,
      roleName: 'owner',
      granted: false,
      actorUserId: 'owner-1',
    });

    expect(result).toEqual({ ok: true });
    expect(whereFn).toHaveBeenCalled();
  });

  it('does not count holders when removing a non-owner role', async () => {
    const whereFn = vi.fn().mockResolvedValue(undefined);
    const selectFn = vi.fn(() => reader([]));
    db.transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn({ select: selectFn, delete: () => ({ where: whereFn }) }),
    );

    const result = await setUserRole({
      profileId: 5,
      roleName: 'admin',
      granted: false,
      actorUserId: 'owner-1',
    });

    expect(result).toEqual({ ok: true });
    expect(selectFn).not.toHaveBeenCalled();
  });

  it('stamps the acting owner as the assigner when granting', async () => {
    let values: unknown;
    db.insert.mockReturnValue({
      values: (v: unknown) => {
        values = v;
        return { onConflictDoNothing: () => Promise.resolve(undefined) };
      },
    });

    await setUserRole({
      profileId: 5,
      roleName: 'admin',
      granted: true,
      actorUserId: 'owner-1',
    });

    // `assignedBy` was a dead column, only ever written as the literal 'seed'.
    // This is what makes it answer "who made this person an admin".
    expect(values).toEqual({
      userProfileId: 5,
      roleId: 2,
      assignedBy: 'owner-1',
    });
  });
});
