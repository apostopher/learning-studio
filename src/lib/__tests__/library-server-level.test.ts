// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getUserRoleNames: vi.fn(),
  getCourseDetailsWithCache: vi.fn(),
  getCourseIdentityBySlug: vi.fn(),
  getCourseProgress: vi.fn(),
  isSubscribedToCourse: vi.fn(),
  getLibraryForCourse: vi.fn(),
  getCurrentLevel: vi.fn(),
}));

vi.mock('#/db/admin', () => ({ getUserRoleNames: m.getUserRoleNames }));
vi.mock('#/db/course', () => ({
  getCourseDetailsWithCache: m.getCourseDetailsWithCache,
  getCourseIdentityBySlug: m.getCourseIdentityBySlug,
}));
vi.mock('#/db/course-progress', () => ({
  getCourseProgress: m.getCourseProgress,
}));
vi.mock('#/db/lesson-access', () => ({
  isSubscribedToCourse: m.isSubscribedToCourse,
}));
vi.mock('#/db/library', () => ({
  getLibraryForCourse: m.getLibraryForCourse,
}));
vi.mock('#/db/user-levels', () => ({ getCurrentLevel: m.getCurrentLevel }));

import { getLibraryForUser } from '#/lib/library.server';

/**
 * `basic-only` has NO video, which is what makes this the leaky case rather
 * than an edge one: `isLessonSatisfied` returns true for any lesson without a
 * video, so its file was `{kind:'open'}` — listed AND downloadable — for a
 * pilot whom `/api/lesson/material` would 403 for the very same lesson.
 */
const details = {
  modules: [
    {
      id: 1,
      slug: 'm1',
      name: 'Module One',
      dependsOn: [],
      sequentialLessons: false,
      lessons: [
        {
          id: 10,
          slug: 'basic-only',
          name: 'Basic Only',
          isAvailable: true,
          hasVideo: false,
          needsVideoWatch: true,
          levels: ['basic'],
          dependsOn: [],
        },
        {
          id: 11,
          slug: 'inter-only',
          name: 'Inter Only',
          isAvailable: true,
          hasVideo: false,
          needsVideoWatch: true,
          levels: ['intermediate'],
          dependsOn: [],
        },
      ],
    },
  ],
};

const library = {
  files: [
    { id: 1, name: 'Basic Handout', size: 10, type: 'application/pdf' },
    { id: 2, name: 'Inter Handout', size: 10, type: 'application/pdf' },
  ],
  assignments: [
    { fileId: 1, moduleSlug: null, lessonSlug: 'basic-only' },
    { fileId: 2, moduleSlug: null, lessonSlug: 'inter-only' },
  ],
};

const names = (result: Awaited<ReturnType<typeof getLibraryForUser>>) =>
  result?.files.map((f) => f.name) ?? null;

beforeEach(() => {
  vi.clearAllMocks();
  m.getCourseIdentityBySlug.mockResolvedValue({ id: 7, name: 'RT Course' });
  m.getUserRoleNames.mockResolvedValue([]);
  m.isSubscribedToCourse.mockResolvedValue(true);
  m.getCourseDetailsWithCache.mockResolvedValue(details);
  m.getCourseProgress.mockResolvedValue({ lessons: [] });
  m.getLibraryForCourse.mockResolvedValue(library);
  m.getCurrentLevel.mockResolvedValue('basic');
});

describe('getLibraryForUser level visibility', () => {
  it('withholds a file attached to an out-of-tier lesson', async () => {
    m.getCurrentLevel.mockResolvedValue('intermediate');

    const result = await getLibraryForUser({
      userId: 'u1',
      courseSlug: 'rt',
    });

    // Not merely locked — absent. `resolveAssignment` returns null for a
    // lesson missing from the index, so filtering the course fails CLOSED
    // here, the opposite of what it would do inside `evaluateLessonLock`.
    expect(names(result)).toEqual(['Inter Handout']);
  });

  it('serves the same file to a pilot in the lesson’s tier', async () => {
    m.getCurrentLevel.mockResolvedValue('basic');

    const result = await getLibraryForUser({ userId: 'u1', courseSlug: 'rt' });

    expect(names(result)).toEqual(['Basic Handout']);
  });

  it('withholds an out-of-tier file even when the pilot completed the lesson', async () => {
    // Read-only means "you may re-read the lesson", not "you may keep taking
    // copies of its attachments away with you".
    m.getCurrentLevel.mockResolvedValue('intermediate');
    m.getCourseProgress.mockResolvedValue({
      lessons: [{ lessonId: 10, percent: 100, watched: true }],
    });

    const result = await getLibraryForUser({ userId: 'u1', courseSlug: 'rt' });

    expect(names(result)).toEqual(['Inter Handout']);
  });

  it('withholds a module-scoped file when the whole module is out of tier', async () => {
    m.getCurrentLevel.mockResolvedValue('advanced');
    m.getLibraryForCourse.mockResolvedValue({
      files: [
        { id: 3, name: 'Module Pack', size: 10, type: 'application/pdf' },
      ],
      assignments: [{ fileId: 3, moduleSlug: 'm1', lessonSlug: null }],
    });

    const result = await getLibraryForUser({ userId: 'u1', courseSlug: 'rt' });

    expect(names(result)).toEqual([]);
  });

  it('does not filter for an admin, and does not look up a level for one', async () => {
    m.getUserRoleNames.mockResolvedValue(['admin']);

    const result = await getLibraryForUser({ userId: 'u1', courseSlug: 'rt' });

    expect(names(result)).toEqual(['Basic Handout', 'Inter Handout']);
    expect(m.getCurrentLevel).not.toHaveBeenCalled();
  });
});
