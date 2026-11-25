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
import { type FreshDb, freshDb } from './support/local-pg';

const h = vi.hoisted(() => ({
  db: null as unknown,
  invalidate: vi.fn(async (_slug: string | null) => {}),
  redisModule: () => ({
    redis: { get: async () => null, set: async () => {}, del: async () => {} },
    cacheWithRedis: (_prefix: string, fn: (...a: unknown[]) => unknown) =>
      Object.assign((...a: unknown[]) => fn(...a), { invalidate: vi.fn() }),
  }),
}));
const dbModule = vi.hoisted(() => () => ({
  get db() {
    return h.db;
  },
}));
vi.mock('#/db', () => dbModule());
vi.mock('@/db', () => dbModule());
vi.mock('#/db/course-cache', () => ({
  invalidateCourseDetailsCache: h.invalidate,
}));
vi.mock('#/integrations/upstash/redis', () => h.redisModule());
vi.mock('@/integrations/upstash/redis', () => h.redisModule());
vi.mock('@/db/schema', () => vi.importActual('#/db/schema'));
vi.mock('#/db/lesson-playback', () => ({ getLessonPlayback: vi.fn() }));
vi.mock('#/db/lesson-transcript', () => ({ getLessonTranscript: vi.fn() }));
vi.mock('#/db/video-captions', () => ({ muxCaptionsForPlayback: vi.fn() }));
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: vi.fn(),
}));
vi.mock('#/lib/crypto.server', () => ({ decryptJson: (v: unknown) => v }));
vi.mock('#/lib/video-providers/resolve.server', () => ({
  resolvePlayback: vi.fn(),
  validateCredentials: vi.fn(),
}));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));

const { getCourseBoard } = await import('../admin');
const { getCourseDetails, getMyCourses } = await import('../course');
const { getGatedCourseForAgent } = await import('../course-content');
const { getCourseProgress } = await import('../course-progress');
const { getOrgLibrary } = await import('../editor');
const { getLessonInCourse } = await import('../lesson-access');
const { setLessonVisibility } = await import('../lesson-visibility');
const { LESSON_VISIBILITY_STATEMENTS } = await import(
  '../migrate-lesson-visibility'
);
const { linkLesson, unlinkLesson } = await import('../placements');

/**
 * Course 1 (the flagship) owns M1 and course 2 borrows it; course 2 also owns
 * M2, course 3 owns M3. `a` starts visible, `b` starts hidden. Both are in
 * every module, so course 2 has each twice.
 */
const SEED = `
  truncate organizations, courses, lessons, disciplines, modules, user_profiles,
    lesson_material_progress
    restart identity cascade;
  insert into organizations (name) values ('Org');
  insert into disciplines (org_id, name, slug) values (1, 'UAS', 'uas');
  insert into courses (name, slug) values
    ('One', '3d-airmanship'), ('Two', 'two'), ('Three', 'three');
  insert into course_orgs (course_id, org_id) values (1, 1), (2, 1), (3, 1);
  insert into modules (course_id, name, slug, required_subscriptions) values
    (1, 'M1', 'm1', '{}'), (2, 'M2', 'm2', '{}'), (3, 'M3', 'm3', '{}');
  -- No order to unlock in: what is not seen is hidden, not locked.
  update modules set sequential_lessons = false;
  insert into course_modules (course_id, module_id, rank) values
    (1, 1, 1), (2, 1, 1), (2, 2, 2), (3, 3, 1);
  insert into course_remixes (course_id, source_course_id) values (2, 1);
  insert into lessons (name, slug, required_subscriptions, org_id, discipline_id, is_available)
    values ('A', 'a', '{}', 1, 1, true), ('B', 'b', '{}', 1, 1, false);
  insert into module_lessons (module_id, lesson_id, rank)
    select m, l, l from generate_series(1, 3) m, generate_series(1, 2) l;
  insert into lesson_versions (lesson_id, version, name, text, extra_tab)
    select id, '1.0', name, 'text', 'testThis' from lessons;
  insert into course_lesson_versions (course_id, lesson_id, lesson_version_id)
    select c, l, l from generate_series(1, 3) c, generate_series(1, 2) l;
  insert into user_profiles (user_id, email) values ('u1', 'u1@t.t');
  insert into course_subscriptions (user_id, course_id)
    select 'u1', c from generate_series(1, 3) c;
  insert into lesson_material_progress (user_id, lesson_slug, section_name, completed)
    values ('u1', 'a', 'page', true);
`;

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'who sees a lesson, on Postgres',
  () => {
    let pgDb: FreshDb;
    const COURSES = { 1: '3d-airmanship', 2: 'two', 3: 'three' } as const;
    type CourseId = keyof typeof COURSES;
    const SLUGS: Record<number, string> = { 1: 'a', 2: 'b' };

    beforeAll(async () => {
      pgDb = await freshDb({ migrated: true });
      h.db = pgDb.db;
    });
    afterAll(() => pgDb?.drop());
    beforeEach(async () => {
      vi.clearAllMocks();
      await pgDb.pool.query(SEED);
    });

    const hide = (courseId: number, lessonId: number) =>
      setLessonVisibility({ courseId, lessonId, isVisible: false });
    const show = (courseId: number, lessonId: number) =>
      setLessonVisibility({ courseId, lessonId, isVisible: true });

    /**
     * `module lesson` for each copy a course's learners see. Asked of every
     * reader that decides it, which must all agree.
     */
    async function seenIn(courseId: CourseId): Promise<string[]> {
      const slug = COURSES[courseId];
      const [details, progress, mine, agent, board] = await Promise.all([
        getCourseDetails(slug),
        getCourseProgress({ userId: 'u1', slug }),
        getMyCourses('u1'),
        getGatedCourseForAgent(slug, { userId: 'u1' }),
        getCourseBoard(courseId),
      ]);
      const seen = (details?.modules ?? []).flatMap((m) =>
        m.lessons.map((l) => `${m.slug} ${l.slug}`),
      );
      // Some readers answer per copy and some per lesson.
      const lessons = [...new Set(seen.map((s) => s.split(' ')[1]))].sort();

      expect(
        board?.modules.flatMap((m) =>
          m.lessons
            .filter((l) => l.isAvailable)
            .map((l) => `${m.slug} ${l.slug}`),
        ),
      ).toEqual(seen);
      expect(
        [...new Set(progress.lessons.map((l) => SLUGS[l.lessonId]))].sort(),
      ).toEqual(lessons);
      // `a` is opened and `b` is not, so the card's share says which counted.
      expect(mine.find((c) => c.slug === slug)?.percent).toBe(progress.percent);
      const named = agent?.modules.flatMap((m) =>
        m.lessons.map((l) => l.name.toLowerCase()),
      );
      expect([...new Set(named)].sort()).toEqual(lessons);
      for (const lessonSlug of ['a', 'b']) {
        const gate = await getLessonInCourse({ lessonSlug, courseSlug: slug });
        expect([lessonSlug, gate?.isAvailable]).toEqual([
          lessonSlug,
          lessons.includes(lessonSlug),
        ]);
      }
      return seen;
    }

    it('is as it was before any course decides', async () => {
      expect(await seenIn(1)).toEqual(['m1 a']);
      expect(await seenIn(2)).toEqual(['m1 a', 'm2 a']);
      expect(await seenIn(3)).toEqual(['m3 a']);
    });

    it('hidden in a course: nobody sees it there, everybody still does elsewhere', async () => {
      expect(await hide(3, 1)).toBe(true);
      expect(await seenIn(3)).toEqual([]);
      expect(await seenIn(1)).toEqual(['m1 a']);
      expect(await seenIn(2)).toEqual(['m1 a', 'm2 a']);
    });

    it('hides a copy the course borrows as well as its own', async () => {
      await hide(2, 1);
      expect(await seenIn(2)).toEqual([]);
      expect(await seenIn(1)).toEqual(['m1 a']);
    });

    it('shown in a course: there and nowhere else', async () => {
      await show(3, 2);
      expect(await seenIn(3)).toEqual(['m3 a', 'm3 b']);
      expect(await seenIn(1)).toEqual(['m1 a']);
      expect(await seenIn(2)).toEqual(['m1 a', 'm2 a']);
    });

    it('in the course owning a module, the answer is every borrower’s too', async () => {
      await show(1, 2);
      await hide(1, 1);
      expect(await seenIn(1)).toEqual(['m1 b']);
      // Its own copies are its own to show.
      expect(await seenIn(2)).toEqual(['m1 b', 'm2 a']);
      expect(await seenIn(3)).toEqual(['m3 a']);
    });

    it('is changed by the last answer', async () => {
      await hide(3, 1);
      await show(3, 1);
      expect(await seenIn(3)).toEqual(['m3 a']);
    });

    it('is kept through a removal and adding back', async () => {
      const readd = async (lessonId: number) => {
        await unlinkLesson(3, lessonId);
        await linkLesson({
          moduleId: 3,
          lessonId,
          prevLessonId: null,
          nextLessonId: null,
        });
      };
      await hide(3, 1);
      await show(3, 2);
      await readd(1);
      await readd(2);
      expect(await seenIn(3)).toEqual(['m3 b']);
    });

    it('changes nothing in Disciplines', async () => {
      const before = await getOrgLibrary(1);
      await hide(3, 1);
      await show(3, 2);
      expect(await getOrgLibrary(1)).toEqual(before);
    });

    it('is not a course’s to say for a lesson it only borrows, or does not have', async () => {
      await pgDb.pool.query('delete from module_lessons where module_id = 2');
      expect(await hide(2, 1)).toBe(false);
      expect(await hide(3, 99)).toBe(false);
      expect(
        (await pgDb.pool.query('select * from course_lesson_visibility')).rows,
      ).toEqual([]);
      expect(h.invalidate).not.toHaveBeenCalled();
    });

    it('evicts the cached payload of every course it changes', async () => {
      await hide(1, 1);
      expect(h.invalidate.mock.calls.flat().sort()).toEqual([
        '3d-airmanship',
        'two',
      ]);
    });

    it('a hidden lesson keeps its module’s prerequisites in the payload', async () => {
      await pgDb.pool.query(
        `insert into module_dependencies (module_id, depends_on) values (3, '{m1}')`,
      );
      await hide(3, 1);
      const details = await getCourseDetails('three');
      expect(details?.modules.map((m) => m.dependsOn)).toEqual([['m1']]);
    });

    it('the migration runs again without changing an answer', async () => {
      await hide(3, 1);
      for (const statement of LESSON_VISIBILITY_STATEMENTS) {
        await pgDb.db.execute(statement);
      }
      expect(await seenIn(3)).toEqual([]);
    });
  },
);
