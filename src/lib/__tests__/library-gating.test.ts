import { describe, expect, it } from 'vitest';
import type { GateCourse, GateLesson } from '#/lib/lesson-gating';
import {
  canDownloadLibraryFile,
  type LibraryAssignment,
  type LibraryFileInput,
  resolveLibraryFiles,
} from '#/lib/library-gating';

const lesson = (
  slug: string,
  overrides: Partial<GateLesson> = {},
): GateLesson => ({
  slug,
  name: slug,
  isAvailable: true,
  hasVideo: true,
  needsVideoWatch: true,
  dependsOn: [],
  ...overrides,
});

const course = (
  modules: { slug: string; lessons: GateLesson[] }[],
): GateCourse => ({
  modules: modules.map((m) => ({
    slug: m.slug,
    name: m.slug,
    dependsOn: [],
    sequentialLessons: true,
    lessons: m.lessons,
  })),
});

const file = (id: number, name = `file-${id}`): LibraryFileInput => ({
  id,
  name,
  size: 1000,
  type: 'application/pdf',
});

const assign = (
  fileId: number,
  moduleSlug: string | null,
  lessonSlug: string | null,
): LibraryAssignment => ({ fileId, moduleSlug, lessonSlug });

const resolve = (
  args: Partial<Parameters<typeof resolveLibraryFiles>[0]> & {
    course: GateCourse;
  },
) =>
  resolveLibraryFiles({
    files: args.files ?? [file(1)],
    assignments: args.assignments ?? [],
    course: args.course,
    watchedLessonSlugs: args.watchedLessonSlugs ?? new Set(),
  });

describe('resolveLibraryFiles', () => {
  describe('lesson-scoped assignments (D5)', () => {
    const c = course([{ slug: 'm1', lessons: [lesson('l1')] }]);

    it('locks a file whose lesson video is unwatched, naming the lesson', () => {
      const [only] = resolve({
        course: c,
        assignments: [assign(1, 'm1', 'l1')],
      });
      expect(only.lock).toEqual({
        kind: 'lesson-locked',
        lessonName: 'l1',
        lessonSlug: 'l1',
        moduleSlug: 'm1',
      });
    });

    it('opens the file once that video is watched', () => {
      const [only] = resolve({
        course: c,
        assignments: [assign(1, 'm1', 'l1')],
        watchedLessonSlugs: new Set(['l1']),
      });
      expect(only.lock).toEqual({ kind: 'open' });
    });

    /**
     * 15 imported assignments hang off lessons with `needs_video_watch = true`
     * and no video. The old platform read `videosProgress[undefined] || 0`,
     * compared it to 100, and locked them forever.
     */
    it('opens a file on a lesson that has no video to watch', () => {
      const [only] = resolve({
        course: course([
          { slug: 'm1', lessons: [lesson('l1', { hasVideo: false })] },
        ]),
        assignments: [assign(1, 'm1', 'l1')],
      });
      expect(only.lock).toEqual({ kind: 'open' });
    });

    it('opens a file on a lesson with watching switched off', () => {
      const [only] = resolve({
        course: course([
          { slug: 'm1', lessons: [lesson('l1', { needsVideoWatch: false })] },
        ]),
        assignments: [assign(1, 'm1', 'l1')],
      });
      expect(only.lock).toEqual({ kind: 'open' });
    });
  });

  describe('WIP and missing targets (D9)', () => {
    /**
     * `getCourseDetailsWithCache` strips unavailable lessons, so a WIP lesson
     * simply is not in the gate course. It must NOT reach isLessonSatisfied,
     * whose `!isAvailable` escape would answer "satisfied" and publish
     * unreleased material to everyone.
     */
    it('hides a file whose only lesson is absent from the course payload', () => {
      expect(
        resolve({
          course: course([{ slug: 'm1', lessons: [] }]),
          assignments: [assign(1, 'm1', 'wip-lesson')],
        }),
      ).toEqual([]);
    });

    it('hides a file whose module is absent entirely', () => {
      expect(
        resolve({
          course: course([]),
          assignments: [assign(1, 'gone', null)],
        }),
      ).toEqual([]);
    });

    it('hides a module-scoped file when every lesson in it is WIP', () => {
      expect(
        resolve({
          course: course([{ slug: 'm1', lessons: [] }]),
          assignments: [assign(1, 'm1', null)],
        }),
      ).toEqual([]);
    });

    it('hides a file with no assignments at all', () => {
      expect(resolve({ course: course([]), assignments: [] })).toEqual([]);
    });

    it('drops only the WIP assignment, keeping the file for its live one', () => {
      const [only] = resolve({
        course: course([{ slug: 'm1', lessons: [lesson('live')] }]),
        assignments: [assign(1, 'm1', 'wip'), assign(1, 'm1', 'live')],
        watchedLessonSlugs: new Set(['live']),
      });
      expect(only.lock).toEqual({ kind: 'open' });
    });

    it('hides a course-wide assignment rather than opening it', () => {
      expect(
        resolve({
          course: course([{ slug: 'm1', lessons: [lesson('l1')] }]),
          assignments: [assign(1, null, null)],
        }),
      ).toEqual([]);
    });
  });

  describe('module-scoped assignments (D6)', () => {
    const twoLessons = course([
      { slug: 'm1', lessons: [lesson('l1'), lesson('l2')] },
    ]);

    it('stays locked until every lesson in the module is watched', () => {
      const [only] = resolve({
        course: twoLessons,
        assignments: [assign(1, 'm1', null)],
        watchedLessonSlugs: new Set(['l1']),
      });
      expect(only.lock).toEqual({
        kind: 'module-locked',
        moduleName: 'm1',
        moduleSlug: 'm1',
      });
    });

    it('opens when the whole module is watched', () => {
      const [only] = resolve({
        course: twoLessons,
        assignments: [assign(1, 'm1', null)],
        watchedLessonSlugs: new Set(['l1', 'l2']),
      });
      expect(only.lock).toEqual({ kind: 'open' });
    });

    it('ignores a video-less lesson when deciding the module is done', () => {
      const [only] = resolve({
        course: course([
          {
            slug: 'm1',
            lessons: [lesson('l1'), lesson('l2', { hasVideo: false })],
          },
        ]),
        assignments: [assign(1, 'm1', null)],
        watchedLessonSlugs: new Set(['l1']),
      });
      expect(only.lock).toEqual({ kind: 'open' });
    });
  });

  describe('the stored module is ignored when a lesson is named (D8)', () => {
    /**
     * Files 9, 19 and 48 name module 10 while their lesson lives in module 9.
     * The old code looked the lesson up INSIDE the stated module, failed, and
     * returned hasAccess:false — permanently.
     */
    const mismatched = course([
      { slug: 'm9', lessons: [lesson('reading-list')] },
      { slug: 'm10', lessons: [lesson('other')] },
    ]);

    it('resolves through the lesson, not the stated module', () => {
      const [only] = resolve({
        course: mismatched,
        assignments: [assign(1, 'm10', 'reading-list')],
        watchedLessonSlugs: new Set(['reading-list']),
      });
      expect(only.lock).toEqual({ kind: 'open' });
    });

    it('reports the lesson’s REAL module in the lock, so the link works', () => {
      const [only] = resolve({
        course: mismatched,
        assignments: [assign(1, 'm10', 'reading-list')],
      });
      expect(only.lock).toMatchObject({
        kind: 'lesson-locked',
        moduleSlug: 'm9',
      });
    });
  });

  describe('multiple assignments per file (D7)', () => {
    const c = course([
      { slug: 'm1', lessons: [lesson('a')] },
      { slug: 'm2', lessons: [lesson('b')] },
    ]);

    it('opens when ANY assignment is satisfied', () => {
      const [only] = resolve({
        course: c,
        assignments: [assign(1, 'm1', 'a'), assign(1, 'm2', 'b')],
        watchedLessonSlugs: new Set(['b']),
      });
      expect(only.lock).toEqual({ kind: 'open' });
    });

    it('returns the file exactly once however many assignments it has', () => {
      expect(
        resolve({
          course: c,
          assignments: [assign(1, 'm1', 'a'), assign(1, 'm2', 'b')],
        }),
      ).toHaveLength(1);
    });

    it('shows the EARLIEST unmet lesson when all are locked', () => {
      const [only] = resolve({
        course: c,
        assignments: [assign(1, 'm2', 'b'), assign(1, 'm1', 'a')],
      });
      expect(only.lock).toMatchObject({ lessonSlug: 'a' });
    });

    /**
     * The regression this replaces: the old `uniqBy` kept whichever row came
     * first by createdAt, so the outcome depended on row order.
     */
    it('is order-independent', () => {
      const forward = resolve({
        course: c,
        assignments: [assign(1, 'm1', 'a'), assign(1, 'm2', 'b')],
        watchedLessonSlugs: new Set(['a']),
      });
      const reversed = resolve({
        course: c,
        assignments: [assign(1, 'm2', 'b'), assign(1, 'm1', 'a')],
        watchedLessonSlugs: new Set(['a']),
      });
      expect(forward).toEqual(reversed);
    });
  });

  describe('ordering (D14)', () => {
    const c = course([
      { slug: 'm1', lessons: [lesson('a')] },
      { slug: 'm2', lessons: [lesson('b')] },
    ]);

    it('puts unlocked files before locked ones', () => {
      const out = resolve({
        course: c,
        files: [file(1, 'locked'), file(2, 'unlocked')],
        assignments: [assign(1, 'm1', 'a'), assign(2, 'm2', 'b')],
        watchedLessonSlugs: new Set(['b']),
      });
      expect(out.map((f) => f.name)).toEqual(['unlocked', 'locked']);
    });

    it('orders same-lock files by course position, not file id', () => {
      const out = resolve({
        course: c,
        files: [file(1, 'in-m2'), file(2, 'in-m1')],
        assignments: [assign(1, 'm2', 'b'), assign(2, 'm1', 'a')],
      });
      expect(out.map((f) => f.name)).toEqual(['in-m1', 'in-m2']);
    });

    it('breaks position ties by name', () => {
      const out = resolve({
        course: c,
        files: [file(1, 'zebra'), file(2, 'apple')],
        assignments: [assign(1, 'm1', 'a'), assign(2, 'm1', 'a')],
      });
      expect(out.map((f) => f.name)).toEqual(['apple', 'zebra']);
    });
  });

  it('never returns a URL field, whatever the input carries', () => {
    const [only] = resolve({
      course: course([{ slug: 'm1', lessons: [lesson('l1')] }]),
      assignments: [assign(1, 'm1', 'l1')],
      watchedLessonSlugs: new Set(['l1']),
    });
    expect(Object.keys(only).sort()).toEqual([
      'id',
      'lock',
      'name',
      'size',
      'type',
    ]);
  });

  it('does not leak the internal sort position into the payload', () => {
    const [only] = resolve({
      course: course([{ slug: 'm1', lessons: [lesson('l1')] }]),
      assignments: [assign(1, 'm1', 'l1')],
    });
    expect(only).not.toHaveProperty('position');
  });
});

describe('canDownloadLibraryFile', () => {
  const resolved = [
    { ...file(1), lock: { kind: 'open' } as const },
    {
      ...file(2),
      lock: {
        kind: 'lesson-locked',
        lessonName: 'l',
        lessonSlug: 'l',
        moduleSlug: 'm',
      } as const,
    },
  ];

  it('allows an open file', () => {
    expect(canDownloadLibraryFile(1, resolved)).toBe(true);
  });

  it('refuses a locked file', () => {
    expect(canDownloadLibraryFile(2, resolved)).toBe(false);
  });

  it('refuses a file that is not in the resolved set at all', () => {
    expect(canDownloadLibraryFile(3, resolved)).toBe(false);
  });
});
