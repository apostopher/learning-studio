// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ insert: vi.fn(), execute: vi.fn() }));
vi.mock('#/db', () => ({ db }));
vi.mock('#/db/schema', async () => {
  const { integer, pgTable, varchar } = await import('drizzle-orm/pg-core');
  return {
    courseSubscriptionsTable: pgTable('course_subscriptions', {
      id: integer('id').primaryKey(),
      userId: varchar('user_id', { length: 255 }),
      courseId: integer('course_id'),
      grantedBy: varchar('granted_by', { length: 255 }),
    }),
    coursesTable: pgTable('courses', { id: integer('id').primaryKey() }),
    userProfileRolesTable: pgTable('user_profile_roles', {
      userProfileId: integer('user_profile_id'),
    }),
    userProfileTable: pgTable('user_profiles', {
      id: integer('id').primaryKey(),
    }),
    userRolesTable: pgTable('user_roles', { id: integer('id').primaryKey() }),
  };
});

import { courseSubscriptionsTable } from '#/db/schema';
import { addUserEnrolment } from '#/db/users';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addUserEnrolment', () => {
  it('grants the course and writes no level row: a new enrolee starts with no level', async () => {
    const values = vi.fn();
    const chain = {
      values: (v: unknown) => {
        values(v);
        return chain;
      },
      onConflictDoNothing: () => Promise.resolve(undefined),
    };
    db.insert.mockReturnValue(chain);

    await addUserEnrolment({ userId: 'u1', courseId: 7, grantedBy: 'a1' });

    // Every write went to course_subscriptions — none to user_levels.
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledWith(courseSubscriptionsTable);
    expect(values).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
      grantedBy: 'a1',
    });
    expect(db.execute).not.toHaveBeenCalled();
  });
});
