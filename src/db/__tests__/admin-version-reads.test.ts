// @vitest-environment node
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  type BoardLesson,
  boardLessonSchema,
  disciplineLessons,
  libraryLessonSchema,
  orgEditorBoardSchema,
} from '#/lib/admin-schemas';
import { type FreshDb, freshDb } from './support/local-pg';

const h = vi.hoisted(() => ({
  db: null as unknown,
  buildLessonPosters: vi.fn(async (_i: unknown) => ({})),
  resolvePlayback: vi.fn(),
}));
vi.mock('#/db', () => ({
  get db() {
    return h.db;
  },
}));
// Everything these reads reach outside Postgres: caches, blobs, video APIs.
vi.mock('#/db/course-cache', () => ({ invalidateCourseDetailsCache: vi.fn() }));
vi.mock('#/db/lesson-playback', () => ({ getLessonPlayback: vi.fn() }));
vi.mock('#/db/lesson-transcript', () => ({ getLessonTranscript: vi.fn() }));
vi.mock('#/db/video-captions', () => ({ muxCaptionsForPlayback: vi.fn() }));
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: vi.fn(),
}));
vi.mock('#/lib/crypto.server', () => ({ decryptJson: (v: unknown) => v }));
vi.mock('#/lib/video-providers/posters.server', () => ({
  buildLessonPosters: h.buildLessonPosters,
}));
vi.mock('#/lib/video-providers/resolve.server', () => ({
  resolvePlayback: h.resolvePlayback,
  validateCredentials: vi.fn(),
}));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));

const { getCourseBoard, getCourseLessonPosters, resolveLessonPlayback } =
  await import('../admin');
const { getOrgEditorBoard, getOrgLibrary } = await import('../editor');
const { getDisciplineLessonPosters } = await import('../library-posters');
const { createLibraryLesson } = await import('../library-lessons');
const { countCoursesOnVersion } = await import('../lesson-versions');

const quiz = (n: number) =>
  JSON.stringify(Array.from({ length: n }, (_, id) => ({ id })));
const alternate = (ref: string) =>
  JSON.stringify([{ lang: 'hi', provider: 'mux', ref }]);

/**
 * Course 1 owns modules 1 and 2, course 2 borrows module 1, course 3 owns
 * module 3 (lesson `a` only). Courses 3 and 4 hold pins left behind: course 3
 * of `c`, course 4, which shows nothing, of `a` and `c`.
 *
 * Lesson `a`: course 1 on 1.9, courses 2 and 3 on 1.10 (the highest taken),
 * the working copy at 1.11. Course 1 shows it twice, course 2 once.
 * Lesson `b`: frozen with no video and no material; the working copy has both.
 * Lesson `c`: the reverse.
 * Lesson `d`: in course 1 with no pin.
 * Lesson `e`: in no course, never taken.
 */
const SEED = `
  truncate organizations, courses, lessons, disciplines, modules, course_video_providers
    restart identity cascade;
  insert into organizations (name) values ('Org');
  insert into disciplines (org_id, name, slug) values (1, 'UAS', 'uas');
  insert into courses (name, slug) values
    ('One', 'one'), ('Two', 'two'), ('Three', 'three'), ('Four', 'four');
  insert into course_orgs (course_id, org_id) values (1, 1), (2, 1), (3, 1), (4, 1);
  insert into course_video_providers (course_id, provider, secrets)
    values (1, 'mux', '{"key":"one"}'), (2, 'mux', '{"key":"two"}');
  insert into modules (course_id, name, slug, required_subscriptions) values
    (1, 'M1', 'm1', '{}'), (1, 'M2', 'm2', '{}'), (3, 'M3', 'm3', '{}');
  insert into course_modules (course_id, module_id, rank) values
    (1, 1, 1), (1, 2, 2), (2, 1, 1), (3, 3, 1);
  insert into lessons (name, slug, required_subscriptions, org_id, discipline_id,
      video_provider, video_ref, other_video_ids, version, is_available,
      content_updated_at) values
    ('A working', 'a', '{}', 1, 1, 'mux', 'a-work', '${alternate('a-hi-work')}', '1.11', true, '2026-11-24 09:38'),
    ('B working', 'b', '{}', 1, 1, 'mux', 'b-work', '[]', '1.1', true, '2026-11-23 10:00'),
    ('C working', 'c', '{}', 1, 1, null, null, '[]', '1.1', true, '2026-11-22 10:00'),
    ('D working', 'd', '{}', 1, 1, 'mux', 'd-work', '[]', '1.0', true, '2026-11-21 10:00'),
    ('E working', 'e', '{}', 1, 1, null, null, '[]', '1.0', true, '2026-11-20 10:00');
  insert into module_lessons (module_id, lesson_id, rank) values
    (1, 1, 1), (2, 1, 1), (3, 1, 1), (1, 2, 2), (1, 3, 3), (2, 4, 2);
  insert into lesson_material (lesson_slug, text, quiz) values
    ('a', 'a', '${quiz(5)}'), ('b', 'b', '${quiz(4)}'), ('d', 'd', '${quiz(3)}');
  insert into lesson_versions (lesson_id, version, name, video_provider, video_ref,
      other_video_ids, text, quiz, extra_tab) values
    (1, '1.9', 'A nine', 'mux', 'a-1.9', '${alternate('a-hi-1.9')}', 'a', '${quiz(1)}', 'testThis'),
    (1, '1.10', 'A ten', 'mux', 'a-1.10', '[]', 'a', '${quiz(2)}', 'testThis'),
    (2, '1.0', 'B one', null, null, '[]', null, null, 'testThis'),
    (3, '1.0', 'C one', 'mux', 'c-1.0', '[]', 'c', '${quiz(3)}', 'testThis'),
    (3, '1.1', 'C taken', null, null, '[]', null, null, 'testThis');
  insert into course_lesson_versions (course_id, lesson_id, lesson_version_id) values
    (1, 1, 1), (2, 1, 2), (3, 1, 2), (4, 1, 2),
    (1, 2, 3), (2, 2, 3),
    (1, 3, 4), (2, 3, 5), (3, 3, 5), (4, 3, 5);
`;

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'what an admin reads, on Postgres',
  () => {
    let pgDb: FreshDb;

    beforeAll(async () => {
      pgDb = await freshDb({ migrated: true });
      h.db = pgDb.db;
    });
    afterAll(() => pgDb?.drop());
    beforeEach(async () => {
      vi.clearAllMocks();
      h.resolvePlayback.mockImplementation(async (_provider, ref: string) => ({
        status: 'ready',
        url: `https://cdn/${ref}`,
        kind: 'hls',
        expiresInSeconds: 3600,
        poster: null,
        captions: null,
      }));
      await pgDb.pool.query(SEED);
    });

    const boardOf = async (courseId: number) =>
      ((await getCourseBoard(courseId))?.modules ?? []).map((m) => m.lessons);
    /** As the client has it, over the wire. */
    const wire = (value: unknown) => JSON.parse(JSON.stringify(value));
    const content = (l: BoardLesson) => [
      l.slug,
      l.name,
      l.videoRef,
      l.isConfigured,
      l.quizQuestionCount,
      l.version,
      l.disciplineVersion,
    ];

    it('board shows the pinned name/video/quiz count and both versions', async () => {
      const [m1] = await boardOf(1);
      expect(m1.map(content)).toEqual([
        ['a', 'A nine', 'a-1.9', true, 1, '1.9', '1.11'],
        ['b', 'B one', null, false, 0, '1.0', '1.1'],
        ['c', 'C one', 'c-1.0', true, 3, '1.0', '1.1'],
      ]);
      expect(m1.map((l) => l.videoProvider)).toEqual(['mux', null, 'mux']);
      // Borrowing course 1's module does not borrow its versions.
      const [borrowed] = await boardOf(2);
      expect(borrowed.map(content)).toEqual([
        ['a', 'A ten', 'a-1.10', true, 2, '1.10', '1.11'],
        ['b', 'B one', null, false, 0, '1.0', '1.1'],
        ['c', 'C taken', null, false, 0, '1.1', '1.1'],
      ]);
      // The working copy's edit date, surviving the wire.
      expect(
        boardLessonSchema.parse(wire(m1[0])).contentUpdatedAt.toISOString(),
      ).toBe('2026-11-24T09:38:00.000Z');
    });

    it('a lesson a course shows twice appears once per placement, not multiplied', async () => {
      expect((await boardOf(1)).map((m) => m.map((l) => l.slug))).toEqual([
        ['a', 'b', 'c'],
        ['a', 'd'],
      ]);
      const twice = (await boardOf(1)).flat().filter((l) => l.slug === 'a');
      expect(twice.map((l) => l.version)).toEqual(['1.9', '1.9']);
    });

    it('a lesson with no pin stays on the board, named, with nothing to teach', async () => {
      const unpinned = (await boardOf(1))[1][1];
      expect(content(unpinned)).toEqual([
        'd',
        'D working',
        null,
        false,
        0,
        '1.0',
        '1.0',
      ]);
      expect(() => boardLessonSchema.parse(wire(unpinned))).not.toThrow();
      expect(await resolveLessonPlayback(4, 1, 'en', 'course')).toBeNull();
    });

    it('the editor payload carries versions and no video identity', async () => {
      const boards = await getOrgEditorBoard(1);
      const lessons = boards.flatMap((b) =>
        b.modules.flatMap((m) => m.lessons),
      );
      expect(lessons).toHaveLength(9);
      for (const lesson of lessons) {
        expect(lesson).not.toHaveProperty('videoRef');
        expect(lesson).not.toHaveProperty('videoProvider');
      }
      expect(JSON.stringify(boards)).not.toMatch(/a-1\.9|a-work|c-1\.0/);
      const parsed = orgEditorBoardSchema.parse(wire(boards));
      expect(
        parsed
          .flatMap((b) => b.modules[0]?.lessons[0] ?? [])
          .map((l) => [l.name, l.version, l.disciplineVersion]),
      ).toEqual([
        ['A nine', '1.9', '1.11'],
        ['A ten', '1.10', '1.11'],
        ['A ten', '1.10', '1.11'],
      ]);
    });

    it('posters use the pinned ref in a course and the working ref on the shelf', async () => {
      const refs = () => {
        const { lessons } = h.buildLessonPosters.mock.calls.at(-1)?.[0] as {
          lessons: { id: number; ref: string }[];
        };
        return Object.fromEntries(lessons.map((l) => [l.id, l.ref]));
      };
      await getCourseLessonPosters(1);
      expect(refs()).toEqual({ 1: 'a-1.9', 3: 'c-1.0' });
      await getCourseLessonPosters(2);
      expect(refs()).toEqual({ 1: 'a-1.10' });
      await getDisciplineLessonPosters(1, 1);
      expect(refs()).toEqual({ 1: 'a-work', 2: 'b-work', 4: 'd-work' });
    });

    it("playback plays the course's version, or the working copy for Disciplines", async () => {
      const played = async (
        ...args: Parameters<typeof resolveLessonPlayback>
      ) => {
        const result = await resolveLessonPlayback(...args);
        return (
          result && [
            (result as { url: string }).url,
            result.lang,
            // Signed with the named course's key either way.
            h.resolvePlayback.mock.calls.at(-1)?.[2],
          ]
        );
      };
      const one = { key: 'one' };
      expect(await played(1, 1, 'en', 'course')).toEqual([
        'https://cdn/a-1.9',
        'en',
        one,
      ]);
      expect(await played(1, 1, 'hi', 'course')).toEqual([
        'https://cdn/a-hi-1.9',
        'hi',
        one,
      ]);
      expect(await played(1, 2, 'en', 'course')).toEqual([
        'https://cdn/a-1.10',
        'en',
        { key: 'two' },
      ]);
      expect(await played(1, 1, 'en', 'discipline')).toEqual([
        'https://cdn/a-work',
        'en',
        one,
      ]);
      expect(await played(1, 1, 'hi', 'discipline')).toEqual([
        'https://cdn/a-hi-work',
        'hi',
        one,
      ]);
      // Neither fills in for the other.
      expect(await played(2, 1, 'en', 'course')).toBeNull();
      expect(await played(2, 1, 'en', 'discipline')).not.toBeNull();
      expect(await played(3, 1, 'en', 'course')).not.toBeNull();
      expect(await played(3, 1, 'en', 'discipline')).toBeNull();
      // Course 4 shows nothing: its leftover pin plays nothing.
      expect(await played(1, 4, 'en', 'course')).toBeNull();
      expect(await played(1, 4, 'en', 'discipline')).toBeNull();
    });

    const libraryLessons = async () =>
      disciplineLessons((await getOrgLibrary(1)).disciplines[0]).map((l) =>
        libraryLessonSchema.parse(wire(l)),
      );

    it('library reports highestTaken by number, 1.10 over 1.9', async () => {
      expect(
        (await libraryLessons()).map((l) => [
          l.name,
          l.version,
          l.highestTaken,
          l.contentUpdatedAt.toISOString(),
        ]),
      ).toEqual([
        ['A working', '1.11', '1.10', '2026-11-24T09:38:00.000Z'],
        ['B working', '1.1', '1.0', '2026-11-23T10:00:00.000Z'],
        ['C working', '1.1', '1.1', '2026-11-22T10:00:00.000Z'],
        ['D working', '1.0', null, '2026-11-21T10:00:00.000Z'],
        ['E working', '1.0', null, '2026-11-20T10:00:00.000Z'],
      ]);
    });

    it('library counts the courses on exactly the current version', async () => {
      const counts = async () =>
        (await libraryLessons()).map((l) => [
          l.slug,
          l.versionCourseCount,
          l.courseCount,
        ]);
      expect(await counts()).toEqual([
        ['a', 0, 3],
        ['b', 0, 2],
        ['c', 1, 2], // course 2; courses 3 and 4 no longer show it
        ['d', 0, 1],
        ['e', 0, 0],
      ]);

      // Course 1 shows `a` twice and still counts once.
      await pgDb.pool.query(`update lessons set version = '1.9' where id = 1`);
      expect((await counts())[0]).toEqual(['a', 1, 3]);
      await pgDb.pool.query(`update lessons set version = '1.10' where id = 1`);
      expect((await counts())[0]).toEqual(['a', 2, 3]);
      // The number the locked message says.
      expect(await countCoursesOnVersion(1, '1.10')).toBe(2);
      expect(await countCoursesOnVersion(1, '1.9')).toBe(1);
    });

    it('a new library lesson starts at 1.0, taken by nobody', async () => {
      const created = libraryLessonSchema.parse(
        wire(
          await createLibraryLesson({ orgId: 1, disciplineId: 1, name: 'F' }),
        ),
      );
      expect(created).toEqual(
        (await libraryLessons()).find((l) => l.id === created.id),
      );
      expect([
        created.version,
        created.highestTaken,
        created.versionCourseCount,
      ]).toEqual(['1.0', null, 0]);
    });
  },
);
