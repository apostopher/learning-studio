import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  isOnCourseRoster: vi.fn(),
  isOnCourseRosterBySlug: vi.fn(),
  isCourseStaff: vi.fn(),
  isCourseStaffBySlug: vi.fn(),
}));
vi.mock('#/db/course-roster-access', () => ({
  isOnCourseRoster: m.isOnCourseRoster,
  isOnCourseRosterBySlug: m.isOnCourseRosterBySlug,
}));
vi.mock('#/db/course-staff', () => ({
  isCourseStaff: m.isCourseStaff,
  isCourseStaffBySlug: m.isCourseStaffBySlug,
}));

import {
  viewsCourseAsAuthor,
  viewsCourseAsAuthorBySlug,
} from '#/lib/viewing-as-author';

const ask = (roles: string[], rostered?: boolean) =>
  viewsCourseAsAuthor({ userId: 'u1', roles, courseId: 3, rostered });

beforeEach(() => {
  vi.clearAllMocks();
  m.isOnCourseRoster.mockResolvedValue(false);
  m.isCourseStaff.mockResolvedValue(false);
});

describe('viewsCourseAsAuthor', () => {
  it('an owner/admin not on the roster authors the course', async () => {
    expect(await ask(['owner'])).toBe(true);
    expect(await ask(['admin'], false)).toBe(true);
  });

  it('an owner/admin on the roster takes it as a student', async () => {
    m.isOnCourseRoster.mockResolvedValue(true);
    expect(await ask(['owner'])).toBe(false);
    expect(await ask(['admin'], true)).toBe(false);
  });

  it('staff on the course author it, rostered or not', async () => {
    m.isCourseStaff.mockResolvedValue(true);
    expect(await ask(['subject-expert'], true)).toBe(true);
    expect(await ask(['owner'], true)).toBe(true);
  });

  it('anyone else is a learner', async () => {
    expect(await ask([])).toBe(false);
  });

  it('uses the roster answer it is given rather than asking again', async () => {
    await ask(['owner'], true);
    expect(m.isOnCourseRoster).not.toHaveBeenCalled();
  });

  it('answers the same by slug', async () => {
    m.isOnCourseRosterBySlug.mockResolvedValue(true);
    m.isCourseStaffBySlug.mockResolvedValue(false);
    expect(
      await viewsCourseAsAuthorBySlug({
        userId: 'u1',
        roles: ['owner'],
        courseSlug: 'evtol',
      }),
    ).toBe(false);
  });
});
