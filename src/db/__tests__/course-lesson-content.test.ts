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

const h = vi.hoisted(() => {
  /** What Redis holds. Like Upstash, `get` hands back parsed JSON. */
  const store = new Map<string, unknown>();
  const redis = {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value.startsWith('{') ? JSON.parse(value) : value);
    },
    del: async (...keys: string[]) => {
      for (const key of keys) store.delete(key);
    },
  };
  return {
    db: null as unknown,
    store,
    redisModule: () => ({
      redis,
      cacheWithRedis: (_prefix: string, fn: (...a: unknown[]) => unknown) =>
        Object.assign((...a: unknown[]) => fn(...a), { invalidate: vi.fn() }),
    }),
    resolveCourseProvider: vi.fn(async (courseId: number) => ({ courseId })),
    resolvePlayback: vi.fn(),
    getDerivedKeyPoints: vi.fn(async (text: string) => [`from ${text}`]),
    getUserRoleNames: vi.fn(async () => ['admin']),
  };
});
vi.mock('#/db', () => ({
  get db() {
    return h.db;
  },
}));
vi.mock('#/integrations/upstash/redis', () => h.redisModule());
vi.mock('@/integrations/upstash/redis', () => h.redisModule());
vi.mock('@/db/schema', () => vi.importActual('#/db/schema'));
vi.mock('#/db/admin', () => ({
  getUserRoleNames: h.getUserRoleNames,
  resolveCourseProvider: h.resolveCourseProvider,
}));
vi.mock('#/db/course-progress', () => ({
  getCourseProgress: vi.fn(async () => ({ lessons: [] })),
}));
vi.mock('#/lib/video-providers/resolve.server', () => ({
  resolvePlayback: h.resolvePlayback,
}));
vi.mock('#/lib/video-providers/mux-api.server', () => ({
  muxApiFromCreds: () => null,
}));
vi.mock('#/db/derived-key-points', () => ({
  getDerivedKeyPoints: h.getDerivedKeyPoints,
}));

const {
  getCourseLessonMaterial,
  getHomeCourseIdForVersion,
  getPinnedVersionId,
} = await import('../course-lesson-content');
const { getCourseDetails } = await import('../course');
const { getGatedCourseForAgent } = await import('../course-content');
const { getLessonPlayback } = await import('../lesson-playback');
const { getLessonTranscript } = await import('../lesson-transcript');
const { selectAuthoredQuiz } = await import('../lesson-score-facts');
const { getLessonIdBySlug, getLessonInCourse } = await import(
  '../lesson-access'
);
const { updateCourseLessonVersion } = await import('../lesson-versions');
const { evaluateLessonGate } = await import('#/lib/lesson-gating.server');
const { resolveDebriefSource } = await import(
  '#/lib/lesson-debrief-source.server'
);

const quiz = (id: string) =>
  JSON.stringify([
    {
      id,
      question: `Q ${id}`,
      options: [
        { id: 'a', value: 'A' },
        { id: 'b', value: 'B' },
      ],
      correctOptionId: 'a',
    },
  ]);
const alternate = (ref: string) =>
  JSON.stringify([{ lang: 'hi', provider: 'mux', ref }]);

/**
 * Course 1 and course 2 each own a module holding all four lessons; course 3
 * borrows course 2's; course 4 shows nothing but holds a stale pin.
 *
 * Lesson `a`: course 1 (and 3) on 1.0, course 2 on 1.1, working copy at 1.2.
 * Its discipline was 3D Airmanship at 1.0 and has changed since.
 * Lesson `b`: frozen with no material and no video; the working copy has both.
 * Lesson `c`: the reverse.
 * Lesson `d`: no material, so debriefed from its video. Courses 2 and 3 on 1.0,
 * course 1 on 1.1.
 */
const SEED = `
  truncate organizations, courses, lessons, disciplines, modules, video_captions
    restart identity cascade;
  insert into organizations (name) values ('Org');
  insert into disciplines (org_id, name, slug)
    values (1, '3D Airmanship', '3d-airmanship'), (1, 'UAS', 'uas');
  insert into courses (name, slug) values
    ('One', 'one'), ('Two', 'two'), ('Three', 'three'), ('Four', 'four');
  insert into course_orgs (course_id, org_id) values (1, 1), (2, 1), (3, 1), (4, 1);
  insert into modules (course_id, name, slug, required_subscriptions) values
    (1, 'M1', 'm1', '{}'), (2, 'M2', 'm2', '{}');
  insert into course_modules (course_id, module_id, rank) values
    (1, 1, 1), (2, 2, 1), (3, 2, 1);
  insert into lessons (name, slug, required_subscriptions, org_id, discipline_id,
      video_provider, video_ref, other_video_ids, version, is_available) values
    ('A working', 'a', '{}', 1, 2, 'mux', 'a-ref-1.2', '${alternate('a-hi-1.2')}', '1.2', true),
    ('B', 'b', '{}', 1, 2, 'mux', 'b-ref', '[]', '1.1', true),
    ('C', 'c', '{}', 1, 2, null, null, '[]', '1.1', true),
    ('D', 'd', '{}', 1, 2, 'mux', 'd-ref-1.2', '[]', '1.2', true);
  insert into module_lessons (module_id, lesson_id, rank)
    select m, l, l from generate_series(1, 2) m, generate_series(1, 4) l;
  insert into lesson_material (lesson_slug, text, key_points, quiz, pro_tips, links,
      assignments, job_of_the_day, test_this) values
    ('a', 'a text 1.2', '["a kp 1.2"]', '${quiz('q1.2')}', 'a tips 1.2',
      '[{"url":"https://l/1.2"}]', 'a asg 1.2', null, '[{"url":"https://t/1.2"}]'),
    ('b', 'b text', '["b kp"]', '${quiz('b')}', null, null, null, null, null);
  insert into lesson_versions (lesson_id, version, name, video_provider, video_ref,
      other_video_ids, text, key_points, quiz, pro_tips, links, assignments,
      job_of_the_day, test_this, extra_tab) values
    (1, '1.0', 'A one', 'mux', 'a-ref-1.0', '${alternate('a-hi-1.0')}', 'a text 1.0',
      '["a kp 1.0"]', '${quiz('q1.0')}', 'a tips 1.0', '[{"url":"https://l/1.0"}]',
      'a asg 1.0', 'https://job/1.0', null, 'jobOfTheDay'),
    (1, '1.1', 'A two', 'mux', 'a-ref-1.1', '[]', 'a text 1.1', '["a kp 1.1"]',
      '${quiz('q1.1')}', 'a tips 1.1', null, null, null, '[{"url":"https://t/1.1"}]',
      'testThis'),
    (2, '1.0', 'B', null, null, '[]', null, null, null, null, null, null, null, null, 'testThis'),
    (3, '1.0', 'C', 'mux', 'c-ref', '[]', 'c text', null, '[]', 'c tips', null, null, null, null, 'testThis'),
    (4, '1.0', 'D', 'mux', 'd-ref-1.0', '[]', null, null, null, null, null, null, null, null, 'testThis'),
    (4, '1.1', 'D', 'mux', 'd-ref-1.1', '[]', null, null, null, null, null, null, null, null, 'testThis');
  insert into course_lesson_versions (course_id, lesson_id, lesson_version_id) values
    (1, 1, 1), (2, 1, 2), (3, 1, 1), (4, 1, 1),
    (1, 2, 3), (2, 2, 3), (3, 2, 3),
    (1, 3, 4), (2, 3, 4), (3, 3, 4),
    (1, 4, 6), (2, 4, 5), (3, 4, 5), (4, 4, 5);
`;

/** Captions long enough to debrief from, naming the video they are of. */
const spoken = (ref: string) => `${ref} `.repeat(60).trim();

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'what a course shows, on Postgres',
  () => {
    let pgDb: FreshDb;
    const unpin = (courseId: number, lessonId: number) =>
      pgDb.pool.query(
        'delete from course_lesson_versions where course_id = $1 and lesson_id = $2',
        [courseId, lessonId],
      );
    const lessonsOf = async (slug: string) =>
      (await getCourseDetails(slug))?.modules.flatMap((m) => m.lessons) ?? [];
    const agentLessons = async (slug: string) =>
      (await getGatedCourseForAgent(slug, { userId: 'u1' }))?.modules.flatMap(
        (m) => m.lessons,
      ) ?? [];

    beforeAll(async () => {
      pgDb = await freshDb({ migrated: true });
      h.db = pgDb.db;
      // An unmocked fetch must not leave the machine.
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          const ref = new URL(url).pathname.slice(1);
          return new Response(
            `WEBVTT\n\n00:00.000 --> 00:01.000\n${spoken(ref)}\n`,
          );
        }),
      );
    });
    afterAll(async () => {
      vi.unstubAllGlobals();
      await pgDb?.drop();
    });
    beforeEach(async () => {
      vi.clearAllMocks();
      h.store.clear();
      h.resolvePlayback.mockImplementation(async (_provider, ref: string) => ({
        status: 'ready',
        url: `https://cdn/${ref}`,
        kind: 'hls',
        expiresInSeconds: 3600,
        poster: null,
        captions: { vtt: `https://captions/${ref}` },
      }));
      await pgDb.pool.query(SEED);
    });

    it("getCourseDetails returns each course's pinned name and hasVideo", async () => {
      const shown = async (slug: string) =>
        (await lessonsOf(slug)).map((l) => [
          l.slug,
          l.name,
          l.hasVideo,
          l.videoProvider,
          l.videoRef,
          l.otherVideoIds,
        ]);
      expect(await shown('one')).toEqual([
        [
          'a',
          'A one',
          true,
          'mux',
          'a-ref-1.0',
          [{ lang: 'hi', provider: 'mux', ref: 'a-hi-1.0' }],
        ],
        ['b', 'B', false, null, null, []],
        ['c', 'C', true, 'mux', 'c-ref', []],
        ['d', 'D', true, 'mux', 'd-ref-1.1', []],
      ]);
      expect((await shown('two'))[0]).toEqual([
        'a',
        'A two',
        true,
        'mux',
        'a-ref-1.1',
        [],
      ]);
      // Borrowing course 2's module does not borrow its version.
      expect((await shown('three'))[0][1]).toBe('A one');
      for (const lesson of await lessonsOf('one')) {
        expect(lesson).not.toHaveProperty('version');
        expect(lesson).not.toHaveProperty('contentUpdatedAt');
      }
    });

    it('material, quiz key, playback ref, languages and agent text come from the pin', async () => {
      expect(await getCourseLessonMaterial('a', 1)).toEqual({
        id: 1,
        lessonSlug: 'a',
        text: 'a text 1.0',
        keyPoints: ['a kp 1.0'],
        quiz: JSON.parse(quiz('q1.0')),
        proTips: 'a tips 1.0',
        links: [{ url: 'https://l/1.0' }],
        assignments: 'a asg 1.0',
        jobOfTheDay: 'https://job/1.0',
        testThis: null,
        extraTab: 'jobOfTheDay',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(await getCourseLessonMaterial('a', 2)).toMatchObject({
        text: 'a text 1.1',
        testThis: [{ url: 'https://t/1.1' }],
      });

      expect((await selectAuthoredQuiz('a', 1))?.[0].id).toBe('q1.0');
      expect((await selectAuthoredQuiz('a', 2))?.[0].id).toBe('q1.1');
      expect(await selectAuthoredQuiz('b', 1)).toBeNull();
      expect(await selectAuthoredQuiz('c', 1)).toBeNull();

      // The whole of it: this is sent to the learner as it is.
      expect(await getLessonPlayback('a', { courseId: 1 })).toEqual({
        status: 'ready',
        url: 'https://cdn/a-ref-1.0',
        kind: 'hls',
        expiresInSeconds: 3600,
        poster: null,
        captions: { vtt: 'https://captions/a-ref-1.0' },
        lang: 'en',
        languages: ['en', 'hi'],
      });
      expect(
        await getLessonPlayback('a', { courseId: 1, lang: 'hi' }),
      ).toMatchObject({ url: 'https://cdn/a-hi-1.0', lang: 'hi' });
      expect(
        await getLessonPlayback('a', { courseId: 2, lang: 'hi' }),
      ).toMatchObject({
        url: 'https://cdn/a-ref-1.1',
        lang: 'en',
        languages: ['en'],
      });

      expect(await agentLessons('one')).toEqual([
        {
          slug: 'a',
          versionId: 1,
          name: 'A one',
          text: 'a text 1.0',
          proTips: 'a tips 1.0',
        },
        { slug: 'b', versionId: 3, name: 'B', text: null, proTips: null },
        {
          slug: 'c',
          versionId: 4,
          name: 'C',
          text: 'c text',
          proTips: 'c tips',
        },
        { slug: 'd', versionId: 6, name: 'D', text: null, proTips: null },
      ]);
      expect((await agentLessons('two'))[0]).toEqual({
        slug: 'a',
        versionId: 2,
        name: 'A two',
        text: 'a text 1.1',
        proTips: 'a tips 1.1',
      });
      expect(await getPinnedVersionId('a', 1)).toBe(1);
      expect(await getPinnedVersionId('a', 2)).toBe(2);
    });

    it('a snapshot without material answers null though the working copy has some', async () => {
      expect(await getCourseLessonMaterial('b', 1)).toBeNull();
      // Nor its video, though the working copy has one.
      expect(await getLessonPlayback('b', { courseId: 1 })).toBeNull();
      expect(h.resolvePlayback).not.toHaveBeenCalled();
      expect(await resolveDebriefSource('b', 1)).toBeNull();

      // And the reverse: the snapshot has both, the working copy neither.
      expect(await getCourseLessonMaterial('c', 1)).toMatchObject({
        text: 'c text',
      });
      expect(await getLessonPlayback('c', { courseId: 1 })).toMatchObject({
        url: 'https://cdn/c-ref',
      });
    });

    it("the closing tab is the snapshot's after the lesson changes discipline", async () => {
      expect((await getCourseLessonMaterial('a', 1))?.extraTab).toBe(
        'jobOfTheDay',
      );
      await pgDb.pool.query(
        `update lessons set discipline_id = 1 where slug = 'a'`,
      );
      expect((await getCourseLessonMaterial('a', 2))?.extraTab).toBe(
        'testThis',
      );
    });

    it("resolveDebriefSource uses the served course's snapshot and that version's home course", async () => {
      const source = {
        kind: 'material',
        keyPoints: ['a kp 1.0'],
        context: spoken('a-ref-1.0'),
      };
      expect(await resolveDebriefSource('a', 1)).toEqual(source);
      // Course 3 shows it through course 2's module, on course 1's version.
      h.store.clear();
      h.resolveCourseProvider.mockClear();
      expect(await resolveDebriefSource('a', 3)).toEqual(source);
      expect(h.resolveCourseProvider.mock.calls).toEqual([[1, 'mux']]);
      // Course 2 is on another version of the same lesson.
      expect(await resolveDebriefSource('a', 2)).toEqual({
        kind: 'material',
        keyPoints: ['a kp 1.1'],
        context: spoken('a-ref-1.1'),
      });
      // No material: the transcript is the source, the version's own.
      expect(await resolveDebriefSource('d', 3)).toEqual({
        kind: 'transcript',
        keyPoints: [`from ${spoken('d-ref-1.0')}`],
        context: spoken('d-ref-1.0'),
      });
      expect(
        [...h.store.keys()].filter((k) => k.includes('transcript')),
      ).toEqual([
        'lesson-transcript:a:1',
        'lesson-transcript:a:2',
        'lesson-transcript:d:5',
      ]);
    });

    it('a version lives in the lowest pinned course owning a module with it', async () => {
      // Course 2 owns the module course 3 borrows; course 1 is on 1.1.
      expect(await getHomeCourseIdForVersion(5)).toBe(2);
      // Course 1 and course 3 are on 1.0 and only course 1 owns a module.
      expect(await getHomeCourseIdForVersion(1)).toBe(1);
      // No pinned course owns one: the lowest pinned course showing it, never
      // course 4, which no longer does.
      await unpin(2, 4);
      expect(await getHomeCourseIdForVersion(5)).toBe(3);
      await unpin(3, 4);
      expect(await getHomeCourseIdForVersion(5)).toBeNull();
    });

    it('an owning course comes before a lower course that borrows', async () => {
      await pgDb.pool.query(
        // Course 1 still owns a module, but without the lesson in it.
        `delete from module_lessons where module_id = 1 and lesson_id = 4;
         insert into course_modules (course_id, module_id, rank) values (1, 2, 2);
         update course_lesson_versions set lesson_version_id = 5
           where course_id = 1 and lesson_id = 4`,
      );
      expect(await getHomeCourseIdForVersion(5)).toBe(2);
    });

    it('Mux captions are those of the video the course plays', async () => {
      await pgDb.pool.query(`insert into video_captions
        (playback_id, track_id, language_code, status, checked_at) values
        ('a-ref-1.0', 'track-1.0', 'en', 'ready', now()),
        ('a-ref-1.2', 'track-1.2', 'en', 'ready', now())`);
      const seen: unknown[] = [];
      h.resolvePlayback.mockImplementation(
        async (_provider, ref: string, creds: unknown, { muxCaptions }) => {
          seen.push(await muxCaptions(ref, creds));
          return { status: 'failed' };
        },
      );
      await getLessonPlayback('a', { courseId: 1 });
      expect(seen).toEqual([{ status: 'ready', trackId: 'track-1.0' }]);
    });

    it('a lesson re-added on a new version is not served the old cached URL', async () => {
      await getLessonPlayback('a', { courseId: 1 });
      await pgDb.pool.query(`update course_lesson_versions
        set lesson_version_id = 2 where course_id = 1 and lesson_id = 1`);
      expect(await getLessonPlayback('a', { courseId: 1 })).toMatchObject({
        url: 'https://cdn/a-ref-1.1',
      });
    });

    it('updating a course evicts the playback of every version of the lesson', async () => {
      await getLessonPlayback('a', { courseId: 1 });
      await getLessonPlayback('a', { courseId: 1, lang: 'hi' });
      await getLessonPlayback('a', { courseId: 2 });
      expect(h.store.size).toBe(3);
      await updateCourseLessonVersion({
        courseId: 1,
        lessonId: 1,
        toVersion: '1.2',
      });
      expect([...h.store.keys()]).toEqual([]);
      expect(await getLessonPlayback('a', { courseId: 1 })).toMatchObject({
        url: 'https://cdn/a-ref-1.2',
      });
    });

    it('a transcript is never stored under a version the course is not on', async () => {
      await expect(
        getLessonTranscript('a', { courseId: 1, versionId: 2 }),
      ).rejects.toThrow(/version/);
      expect(h.store.has('lesson-transcript:a:2')).toBe(false);
    });

    it('a lesson without a pin reads as not in the course, never as the working copy', async () => {
      await unpin(1, 1);
      expect((await lessonsOf('one')).map((l) => l.slug)).toEqual([
        'b',
        'c',
        'd',
      ]);
      expect(await getCourseLessonMaterial('a', 1)).toBeNull();
      expect(await getPinnedVersionId('a', 1)).toBeNull();
      expect(await selectAuthoredQuiz('a', 1)).toBeNull();
      expect(await getLessonPlayback('a', { courseId: 1 })).toBeNull();
      expect(await resolveDebriefSource('a', 1)).toBeNull();
      expect((await agentLessons('one')).map((l) => l.slug)).toEqual([
        'b',
        'c',
        'd',
      ]);
      expect(
        await getLessonInCourse({ lessonSlug: 'a', courseSlug: 'one' }),
      ).toBeNull();
      const gate = { lessonSlug: 'a', courseSlug: 'one' };
      expect(await evaluateLessonGate({ userId: 'u1', ...gate })).toBeNull();
      // A learner too: a lesson the gate finds and the payload lacks is a 500.
      h.getUserRoleNames.mockResolvedValueOnce([]);
      expect(await evaluateLessonGate({ userId: 'u1', ...gate })).toBeNull();
      // The lesson itself is still there.
      expect(await getLessonIdBySlug('a')).toBe(1);
    });

    it('a pin left behind in a course that stopped showing the lesson reads nothing', async () => {
      expect(await getPinnedVersionId('a', 4)).toBeNull();
      expect(await getCourseLessonMaterial('a', 4)).toBeNull();
      expect(await getLessonPlayback('a', { courseId: 4 })).toBeNull();
      expect(await selectAuthoredQuiz('a', 4)).toBeNull();
    });
  },
);
