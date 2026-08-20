// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));
vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', async () => {
  const { integer, pgTable, varchar } = await import('drizzle-orm/pg-core');
  return {
    courseStaffTable: pgTable('course_staff', {
      id: integer('id').primaryKey(),
      userId: varchar('user_id', { length: 255 }),
      courseId: integer('course_id'),
      roleId: integer('role_id'),
      assignedBy: varchar('assigned_by', { length: 255 }),
    }),
    userProfileTable: pgTable('user_profiles', {
      userId: varchar('user_id', { length: 255 }),
      email: varchar('email', { length: 100 }),
      firstName: varchar('first_name', { length: 100 }),
      lastName: varchar('last_name', { length: 100 }),
    }),
    userRolesTable: pgTable('user_roles', {
      id: integer('id').primaryKey(),
      name: varchar('name', { length: 100 }),
    }),
  };
});

import { assignCourseStaff } from '#/db/course-staff';

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * `requireCoursePermission` unions global roles into a `course_staff` lookup,
 * and `getUserPermissions` treats `owner` in that set as `Set(['*'])` — total
 * bypass authority. A `course_staff` row naming `owner` or `admin` would grant
 * that through a door meant only for `subject-expert` / `course-manager`, so
 * the guard has to refuse before any query runs, not just before the insert.
 */
describe('assignCourseStaff — course-scoped role guard', () => {
  it('refuses to assign the global owner role and touches no query', async () => {
    const result = await assignCourseStaff({
      userId: 'user-1',
      courseId: 1,
      roleName: 'owner',
      assignedBy: 'admin-1',
    });

    expect(result).toEqual({ ok: false, reason: 'not-assignable' });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('refuses to assign the global admin role and touches no query', async () => {
    const result = await assignCourseStaff({
      userId: 'user-1',
      courseId: 1,
      roleName: 'admin',
      assignedBy: 'admin-1',
    });

    expect(result).toEqual({ ok: false, reason: 'not-assignable' });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

/**
 * `course_staff.user_id` is a foreign key into `user_profiles`, so an id the
 * directory does not know used to reach the insert and raise a constraint
 * violation nothing catches — a bad request body reading as a 500.
 */
describe('assignCourseStaff — unknown appointee', () => {
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

  it('reports an unknown user instead of letting the foreign key raise', async () => {
    // Role found, profile missing.
    selectReturning([{ id: 3 }], []);

    const result = await assignCourseStaff({
      userId: 'nobody',
      courseId: 1,
      roleName: 'course-manager',
      assignedBy: 'admin-1',
    });

    expect(result).toEqual({ ok: false, reason: 'unknown-user' });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('still writes when the appointee exists', async () => {
    selectReturning([{ id: 3 }], [{ id: 12 }]);
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    db.insert.mockReturnValue({
      values: () => ({ onConflictDoNothing }),
    });

    const result = await assignCourseStaff({
      userId: 'user-1',
      courseId: 1,
      roleName: 'course-manager',
      assignedBy: 'admin-1',
    });

    expect(result).toEqual({ ok: true });
    expect(onConflictDoNothing).toHaveBeenCalled();
  });
});
