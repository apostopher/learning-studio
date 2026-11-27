import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';

// A real drizzle builder with no connection: the SQL each lookup builds is
// what Postgres would run.
vi.mock('#/db', () => ({ db: drizzle.mock() }));

import { rosteredCourseIds } from '#/db/course-roster-access';
import { isSchedulableCourse } from '#/lib/flagship-course';

describe('rosteredCourseIds', () => {
  it('reads offering rosters, never the 3D Airmanship course', () => {
    const { sql, params } = rosteredCourseIds('u1').toSQL();
    expect(sql).toContain('from "offering_users"');
    expect(sql).toContain('"offering_users"."user_id" = $1');
    expect(sql).toContain('"courses"."slug" <> $2');
    expect(params).toEqual(['u1', '3d-airmanship']);
  });
});

describe('isSchedulableCourse', () => {
  it('never schedules 3D Airmanship, and schedules every other course', () => {
    expect(isSchedulableCourse('3d-airmanship')).toBe(false);
    expect(isSchedulableCourse('itps-2-week')).toBe(true);
  });
});
