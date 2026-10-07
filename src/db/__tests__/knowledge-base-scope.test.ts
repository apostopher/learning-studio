// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  courseRows: [] as { id: number }[],
  getUserRoleNames: vi.fn(),
  isSubscribedToCourse: vi.fn(),
  isCourseStaff: vi.fn(),
}));

vi.mock('#/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => m.courseRows }) }),
    }),
  },
}));
vi.mock('#/db/schema', () => ({ coursesTable: { id: 'id', slug: 'slug' } }));
vi.mock('#/db/user-roles', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/lesson-access', () => ({
  isSubscribedToCourse: m.isSubscribedToCourse,
}));
vi.mock('#/db/course-staff', () => ({ isCourseStaff: m.isCourseStaff }));

import { resolveKBCourseId } from '../knowledge-base-scope';

beforeEach(() => {
  vi.clearAllMocks();
  m.courseRows = [{ id: 2 }];
  m.getUserRoleNames.mockResolvedValue([]);
  m.isSubscribedToCourse.mockResolvedValue(false);
  m.isCourseStaff.mockResolvedValue(false);
});

const resolve = (courseSlug?: string) =>
  resolveKBCourseId({ userId: 'u1', courseSlug });

describe('resolveKBCourseId', () => {
  it('opens the course to a subscriber', async () => {
    m.isSubscribedToCourse.mockResolvedValue(true);
    expect(await resolve('ppl')).toBe(2);
    expect(m.isSubscribedToCourse).toHaveBeenCalledWith('u1', 2);
  });

  it('opens it to an org admin without a subscription', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);
    expect(await resolve('ppl')).toBe(2);
    expect(m.isCourseStaff).not.toHaveBeenCalled();
  });

  it("opens it to the course's own staff", async () => {
    m.isCourseStaff.mockResolvedValue(true);
    expect(await resolve('ppl')).toBe(2);
    expect(m.isCourseStaff).toHaveBeenCalledWith('u1', 2);
  });

  it('keeps an outsider to org-wide docs, whatever slug they send', async () => {
    expect(await resolve('ppl')).toBeNull();
  });

  it('keeps an unknown course to org-wide docs', async () => {
    m.courseRows = [];
    expect(await resolve('nope')).toBeNull();
    expect(m.isSubscribedToCourse).not.toHaveBeenCalled();
  });

  it('keeps a chat with no course in context to org-wide docs', async () => {
    expect(await resolve(undefined)).toBeNull();
    expect(m.getUserRoleNames).not.toHaveBeenCalled();
  });
});
