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
