// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

/**
 * Task 15: `discipline_staff` had no writer at all, so every lesson WITH a
 * discipline was uneditable by everyone — `requireLessonContentPermission`
 * hands a disciplined lesson to `requireDisciplinePermission`, which reads a
 * table nothing could ever write. These are the writes that fill it.
 *
 * Real `pgTable` stubs for the four tables this module queries, `#/db` fully
 * mocked, never `importOriginal` — the house pattern from
 * `assign-course-staff-guard.test.ts` and `editor-queries.test.ts`. `#/` and
 * not `@/` throughout: vitest cannot resolve the `@/` alias.
 */
const disciplineStaffTable = pgTable('discipline_staff', {
  id: integer('id').primaryKey(),
  userId: varchar('user_id', { length: 255 }),
  disciplineId: integer('discipline_id'),
  roleId: integer('role_id'),
  assignedBy: varchar('assigned_by', { length: 255 }),
});
const disciplinesTable = pgTable('disciplines', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 120 }),
  slug: varchar('slug', { length: 120 }),
  orgId: integer('org_id'),
});
const userProfileTable = pgTable('user_profiles', {
  id: integer('id').primaryKey(),
  userId: varchar('user_id', { length: 255 }),
  email: varchar('email', { length: 100 }),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
});
const userRolesTable = pgTable('user_roles', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 100 }),
});

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('#/db', () => ({ db }));
/**
 * The org gate both writes now run first. Mocked rather than exercised for
 * real, so these tests can assert on the arguments it RECEIVED — the two ids
 * are both integers and a swapped pair renders identically. Its own SQL (the
 * `id AND org_id` pairing) is pinned in `disciplines-listing.test.ts`, where
 * the real function runs.
 */
const findDisciplineInOrg = vi.hoisted(() => vi.fn());
vi.mock('#/db/disciplines', () => ({ findDisciplineInOrg }));
vi.mock('#/db/schema', () => ({
  disciplineStaffTable,
  disciplinesTable,
  userProfileTable,
  userRolesTable,
}));

const { assignDisciplineStaff, removeDisciplineStaff } = await import(
  '#/db/discipline-staff'
);

/** `select(...).from(...).where(...).limit(1)` resolving with queued rows. */
function selectReturning(...results: unknown[][]) {
  let call = 0;
  db.select.mockImplementation(() => {
    const rows = results[call] ?? [];
    call += 1;
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => Promise.resolve(rows),
    };
    return chain;
  });
}

/** Captures the row handed to `.values()` and the conflict target. */
function captureInsert() {
  const captured: { values?: Record<string, unknown>; target?: unknown } = {};
  const onConflictDoNothing = vi
    .fn()
    .mockImplementation((config: { target?: unknown }) => {
      captured.target = config?.target;
      return Promise.resolve(undefined);
    });
  db.insert.mockImplementation(() => ({
    values: (row: Record<string, unknown>) => {
      captured.values = row;
      return { onConflictDoNothing };
    },
  }));
  return captured;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the discipline belongs to this org. The refusal path is asserted
  // explicitly below.
  findDisciplineInOrg.mockResolvedValue({ id: 42 });
});

describe('assignDisciplineStaff — the grant', () => {
  /**
   * Mutant seen RED: `assignedBy: input.userId` — the appointee credited with
   * their own appointment. Structurally identical, type-correct, and it
   * destroys the only record of who let someone into a discipline.
   *
   * Asserted on the row the INSERT received rather than on the return value:
   * `{ ok: true }` is returned whether or not `assignedBy` was ever written.
   */
  it('writes the (userId, disciplineId, roleId) triple with the appointer as assignedBy', async () => {
    selectReturning([{ id: 3 }], [{ id: 12 }]);
    const captured = captureInsert();

    const result = await assignDisciplineStaff({
      userId: 'expert-1',
      disciplineId: 42,
      roleName: 'subject-expert',
      orgId: 7,
      assignedBy: 'admin-1',
    });

    expect(result).toEqual({ ok: true });
    expect(captured.values).toEqual({
      userId: 'expert-1',
      disciplineId: 42,
      // The id resolved from `user_roles`, not the role NAME — a mutant that
      // wrote the string would type-check against a loose column and blow up
      // only in production.
      roleId: 3,
      assignedBy: 'admin-1',
    });
  });

  /**
   * Mutant seen RED: the conflict target narrowed to
   * `[userId, disciplineId]`. Re-granting would then silently no-op across
   * DIFFERENT roles the day a second discipline-scoped role exists, and the
   * unique index it must match is on all three columns.
   */
  it('de-duplicates on all three columns of the unique index', async () => {
    selectReturning([{ id: 3 }], [{ id: 12 }]);
    const captured = captureInsert();

    await assignDisciplineStaff({
      userId: 'expert-1',
      disciplineId: 42,
      roleName: 'subject-expert',
      orgId: 7,
      assignedBy: 'admin-1',
    });

    expect(captured.target).toEqual([
      disciplineStaffTable.userId,
      disciplineStaffTable.disciplineId,
      disciplineStaffTable.roleId,
    ]);
  });

  /**
   * `requireDisciplinePermission` unions global roles into the discipline
   * lookup, and `getUserPermissions` answers `Set(['*'])` the instant `owner`
   * appears in that union. A `discipline_staff` row naming `owner` would mint
   * unconditional authority through a discipline-shaped door.
   *
   * Mutant seen RED: the `isDisciplineScopedRole` check removed — the insert
   * then runs and `db.select` is called, so both assertions fail.
   */
  it.each([
    'owner',
    'admin',
    'course-manager',
  ])('refuses to grant %s and issues no query at all', async (roleName) => {
    const result = await assignDisciplineStaff({
      userId: 'expert-1',
      disciplineId: 42,
      roleName,
      orgId: 7,
      assignedBy: 'admin-1',
    });

    expect(result).toEqual({ ok: false, reason: 'not-assignable' });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    // Not even the org gate: a role nobody may ever hold is refused on the
    // argument alone, before this function asks the database anything.
    expect(findDisciplineInOrg).not.toHaveBeenCalled();
  });

  /**
   * The grant was the only write in this family that was not org-scoped.
   * `disciplines.org_id` is a real column and `user_profiles` has none, so
   * without this gate any user is grantable on ANY discipline in the database
   * — including one this deployment does not administer.
   *
   * Mutant seen RED: the `findDisciplineInOrg` check removed. `db.select`
   * (role, then profile) and `db.insert` all run, so all three assertions
   * fail. Asserting the INSERT never happened is what makes this a refusal
   * test — a function that writes the row and then returns
   * `unknown-discipline` would satisfy the returned value alone.
   */
  it('refuses a discipline this org does not own, and writes nothing', async () => {
    findDisciplineInOrg.mockResolvedValueOnce(null);
    captureInsert();

    const result = await assignDisciplineStaff({
      userId: 'expert-1',
      disciplineId: 999,
      roleName: 'subject-expert',
      orgId: 7,
      assignedBy: 'admin-1',
    });

    expect(result).toEqual({ ok: false, reason: 'unknown-discipline' });
    expect(db.insert).not.toHaveBeenCalled();
    // Nothing further is learned either — not whether the role exists, not
    // whether the user does.
    expect(db.select).not.toHaveBeenCalled();
  });

  /**
   * Mutant seen RED: `findDisciplineInOrg(input.disciplineId, input.orgId)` —
   * the two arguments swapped. Both are integers, both positions type-check,
   * and the resolver would then look for a discipline whose id is the org id.
   */
  it('asks the org gate about this discipline in this org', async () => {
    selectReturning([{ id: 3 }], [{ id: 12 }]);
    captureInsert();

    await assignDisciplineStaff({
      userId: 'expert-1',
      disciplineId: 42,
      roleName: 'subject-expert',
      orgId: 7,
      assignedBy: 'admin-1',
    });

    expect(findDisciplineInOrg).toHaveBeenCalledWith(7, 42);
  });

  it('reports an unknown appointee instead of letting the foreign key raise', async () => {
    // Role found, profile missing.
    selectReturning([{ id: 3 }], []);
    captureInsert();

    const result = await assignDisciplineStaff({
      userId: 'nobody',
      disciplineId: 42,
      roleName: 'subject-expert',
      orgId: 7,
      assignedBy: 'admin-1',
    });

    expect(result).toEqual({ ok: false, reason: 'unknown-user' });
    expect(db.insert).not.toHaveBeenCalled();
  });

  /**
   * `findDisciplineInOrg` and the INSERT are two separate statements, not one
   * transaction: a discipline deleted in that gap raises Postgres 23503 at
   * the INSERT. `createDiscipline`/`deleteDiscipline` already catch and
   * report their own constraint violations for exactly this shape of race;
   * this pins the same treatment here.
   *
   * Mutant seen RED: the try/catch removed from around the INSERT — the
   * rejection propagates out of `assignDisciplineStaff` instead of resolving
   * to `{ ok: false, reason: 'unknown-discipline' }`, and this `await`
   * rejects instead of returning.
   */
  it('reports unknown-discipline instead of 500ing when the discipline vanishes between the gate and the insert', async () => {
    selectReturning([{ id: 3 }], [{ id: 12 }]);
    db.insert.mockImplementation(() => ({
      values: () => ({
        onConflictDoNothing: () =>
          Promise.reject(
            Object.assign(new Error('insert or update on table violates fk'), {
              code: '23503',
            }),
          ),
      }),
    }));

    const result = await assignDisciplineStaff({
      userId: 'expert-1',
      disciplineId: 42,
      roleName: 'subject-expert',
      orgId: 7,
      assignedBy: 'admin-1',
    });

    expect(result).toEqual({ ok: false, reason: 'unknown-discipline' });
  });
});

describe('removeDisciplineStaff — the revocation', () => {
  /**
   * Mutant seen RED: the `roleId` term dropped from the WHERE (a plausible
   * simplification while only one discipline-scoped role exists). The rendered
   * SQL loses a clause and this `toBe` fails.
   *
   * Rendered SQL AND params, per the house rule: `$1`/`$2`/`$3` hide their
   * values, so a mutant that swapped `userId` and `disciplineId` into each
   * other's clauses would render an identical string.
   */
  it('deletes exactly the one (user, discipline, role) row', async () => {
    selectReturning([{ id: 3 }]);
    let where: SQL | undefined;
    db.delete.mockImplementation(() => ({
      where: (condition: SQL) => {
        where = condition;
        return Promise.resolve(undefined);
      },
    }));

    await removeDisciplineStaff({
      userId: 'expert-1',
      disciplineId: 42,
      roleName: 'subject-expert',
      orgId: 7,
    });

    expect(db.delete).toHaveBeenCalledWith(disciplineStaffTable);
    if (!where) throw new Error('no WHERE was issued');
    expect(renderSql(where)).toBe(
      '("discipline_staff"."user_id" = $1 and "discipline_staff"."discipline_id" = $2 and "discipline_staff"."role_id" = $3)',
    );
    expect(renderSqlParams(where)).toEqual(['expert-1', 42, 3]);
  });

  /**
   * Mutant seen RED: the `if (!role) return` removed — the delete then runs
   * with `roleId: undefined`, which drizzle renders as a bound null and which
   * matches no row on a good day and every row on a bad one.
   */
  /**
   * A revocation is destructive and immediate, so the org gate matters more
   * here than on the grant: without it, `DELETE .../disciplines/<id in another
   * org>/staff` silently unseats that org's subject expert.
   *
   * Mutant seen RED: the `findDisciplineInOrg` check removed — the role lookup
   * and the DELETE both run.
   */
  it('refuses a discipline this org does not own, and deletes nothing', async () => {
    findDisciplineInOrg.mockResolvedValueOnce(null);
    db.delete.mockImplementation(() => ({ where: () => Promise.resolve() }));

    const result = await removeDisciplineStaff({
      userId: 'expert-1',
      disciplineId: 999,
      roleName: 'subject-expert',
      orgId: 7,
    });

    expect(result).toEqual({ ok: false, reason: 'unknown-discipline' });
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it('issues no delete when the role name is unknown', async () => {
    selectReturning([]);
    db.delete.mockImplementation(() => ({ where: () => Promise.resolve() }));

    await removeDisciplineStaff({
      userId: 'expert-1',
      disciplineId: 42,
      roleName: 'not-a-role',
      orgId: 7,
    });

    expect(db.delete).not.toHaveBeenCalled();
  });
});
