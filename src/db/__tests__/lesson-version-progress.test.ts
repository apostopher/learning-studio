// @vitest-environment node
import { eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { KnowledgeChunk } from '#/lib/debrief-mastery';
import { type FreshDb, freshDb } from './support/local-pg';
import { retakeLesson } from './support/retake-lesson';

const h = vi.hoisted(() => {
  /** Redis: only claims matter here. */
  const store = new Map<string, unknown>();
  const redis = {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string, opts?: { nx?: boolean }) => {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
    del: async (...keys: string[]) => {
      for (const key of keys) store.delete(key);
    },
  };
  return {
    db: null as unknown,
    store,
    dbModule: () => ({
      get db() {
        return h.db;
      },
    }),
    redisModule: () => ({
      redis,
      cacheWithRedis: (_prefix: string, fn: (...a: unknown[]) => unknown) =>
        Object.assign((...a: unknown[]) => fn(...a), { invalidate: vi.fn() }),
    }),
    generateKnowledgeChunks: vi.fn(),
    matchKnowledgeChunks: vi.fn(),
    generateTest: vi.fn(),
    evaluateFreeText: vi.fn(),
  };
});
vi.mock('#/db', () => h.dbModule());
vi.mock('@/db', () => h.dbModule());
vi.mock('@/db/schema', () => vi.importActual('#/db/schema'));
vi.mock('#/integrations/upstash/redis', () => h.redisModule());
vi.mock('@/integrations/upstash/redis', () => h.redisModule());
vi.mock('#/db/admin', () => ({ getUserRoleNames: async () => ['admin'] }));
vi.mock('#/db/lesson-playback', () => ({
  getLessonPlayback: { invalidate: vi.fn() },
}));
vi.mock('#/db/lesson-transcript', () => ({
  getLessonTranscript: async () => null,
}));
vi.mock('#/db/derived-key-points', () => ({
  getDerivedKeyPoints: async () => [],
}));
vi.mock('#/ai/generate-knowledge-chunks', () => ({
  generateKnowledgeChunks: h.generateKnowledgeChunks,
}));
vi.mock('#/ai/match-knowledge-chunks', () => ({
  matchKnowledgeChunks: h.matchKnowledgeChunks,
}));
vi.mock('#/ai/generate-test', () => ({ generateTest: h.generateTest }));
vi.mock('#/ai/evaluate-answer', () => ({
  evaluateFreeText: h.evaluateFreeText,
}));
vi.mock('@vercel/functions', () => ({ waitUntil: () => {} }));
vi.mock('#/lib/email/send-level-promotion-email', () => ({
  sendLevelPromotionEmail: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'u1' } }) } },
}));
/** The gate is open; who is asking in which course is all that matters here. */
vi.mock('#/lib/lesson-gating.server', () => ({
  evaluateLessonGate: async ({ courseSlug }: { courseSlug: string }) => ({
    courseSlug,
    courseId: courseSlug === 'one' ? 1 : 2,
    subscribed: true,
    outOfTier: null,
    lessonLock: { kind: 'open' },
    materialLock: { kind: 'open' },
  }),
}));

const schema = await import('#/db/schema');
const { getMyCourses, getCourseDetails } = await import('../course');
const { getCourseProgress } = await import('../course-progress');
const { getDebriefAttemptReports, getDebriefFacts } = await import(
  '../lesson-test'
);
const { findRecentDebriefGaps } = await import('../debrief-gaps');
const { nextChunkVersion, selectLessonChunks, upsertLessonChunks } =
  await import('../knowledge-chunks');
const { ensureLessonChunks } = await import('#/lib/knowledge-chunks.server');
const { prepareDebrief, preparedFingerprint, takePreparedDebrief } =
  await import('#/lib/prepared-debrief.server');
const { answerQuestion, startOrResumeAttempt } = await import(
  '#/lib/debrief-attempt.server'
);
const { computeDebriefState } = await import('#/lib/debrief-schedule');
const { submitLessonQuizHandler } = await import(
  '#/routes/api/lesson/quiz/answers'
);
const { debriefStatusHandler } = await import(
  '#/routes/api/lesson/debrief-status'
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

/**
 * Courses `one` and `two`, learner u1 in both. Each owns a module with lessons
 * a, b, c, d, and both show an empty module.
 *
 * `a`: 1.0 in course one (video, quiz, four sections), 1.1 in course two (text
 * and TEST THIS! only), and yet another content in the working copy, at 1.2.
 * `b`: text and quiz, no video; debrief passed.
 * `c`: a snapshot with nothing in it, though the working copy has everything.
 * `d`: video only, so its debrief counts once one exists in that course.
 */
const SEED = `
  truncate organizations, courses, lessons, disciplines, modules, user_profiles
    restart identity cascade;
  insert into organizations (name) values ('Org');
  insert into disciplines (org_id, name, slug) values (1, 'UAS', 'uas');
  insert into user_profiles (user_id, email) values ('u1', 'u1@t.t'), ('u2', 'u2@t.t');
  insert into courses (name, slug) values ('One', 'one'), ('Two', 'two');
  insert into course_subscriptions (user_id, course_id) values ('u1', 1), ('u1', 2);
  insert into modules (course_id, name, slug, required_subscriptions) values
    (1, 'M1', 'm1', '{}'), (2, 'M2', 'm2', '{}'), (1, 'Empty', 'm3', '{}');
  insert into course_modules (course_id, module_id, rank) values
    (1, 1, 1), (2, 2, 1), (1, 3, 2), (2, 3, 2);
  insert into lessons (name, slug, required_subscriptions, org_id, discipline_id,
      video_provider, video_ref, other_video_ids, version, is_available,
      has_debrief, needs_video_watch) values
    ('A', 'a', '{}', 1, 1, 'mux', 'a-1.2', '[]', '1.2', true, true, true),
    ('B', 'b', '{}', 1, 1, 'mux', 'b-1.1', '[]', '1.1', true, true, true),
    ('C', 'c', '{}', 1, 1, 'mux', 'c-1.1', '[]', '1.1', true, true, true),
    ('D', 'd', '{}', 1, 1, null, null, '[]', '1.1', true, true, true);
  insert into module_lessons (module_id, lesson_id, rank)
    select m, l, l from generate_series(1, 2) m, generate_series(1, 4) l;
  insert into lesson_material (lesson_slug, text, key_points, quiz, assignments) values
    ('a', 'a working', '["kp"]', '${quiz('a-working')}', 'a asg'),
    ('b', 'b working', '["kp"]', null, 'b asg'),
    ('c', 'c working', '["kp"]', '${quiz('c-working')}', null),
    ('d', 'd working', '["kp"]', '${quiz('d-working')}', null);
  insert into lesson_versions (lesson_id, version, name, video_provider, video_ref,
      other_video_ids, text, key_points, quiz, pro_tips, links, assignments,
      job_of_the_day, test_this, extra_tab) values
    (1, '1.0', 'A', 'mux', 'a-1.0', '[]', 'a text 1.0', '["kp1","kp2"]',
      '${quiz('a1.0')}', 'tips', '[{"url":"https://l"}]', null, 'https://job',
      '[{"url":"https://t"}]', 'jobOfTheDay'),
    (1, '1.1', 'A', null, null, '[]', 'a text 1.1', '[]', '[]', null, null, null,
      'https://job', '[{"url":"https://t"}]', 'testThis'),
    (2, '1.0', 'B', null, null, '[]', 'b text', '["kp"]', '${quiz('b')}', null, null, null, null, null, 'testThis'),
    (3, '1.0', 'C', null, null, '[]', null, null, null, null, null, null, null, null, 'testThis'),
    (4, '1.0', 'D', 'mux', 'd-1.0', '[]', null, null, null, null, null, null, null, null, 'testThis');
  insert into course_lesson_versions (course_id, lesson_id, lesson_version_id) values
    (1, 1, 1), (2, 1, 2), (1, 2, 3), (2, 2, 3), (1, 3, 4), (2, 3, 4), (1, 4, 5), (2, 4, 5);
  insert into videos_progress (user_id, lesson_id, progress, created_at)
    select 'u1', 1, p, '2026-11-01 08:00' from generate_series(10, 50, 5) p;
  insert into videos_progress (user_id, lesson_id, progress, created_at)
    select 'u1', 4, p, '2026-11-02 08:00' from generate_series(10, 95, 5) p;
  insert into lesson_quiz_answers (user_id, lesson_slug, answers) values ('u1', 'a', '[]');
  insert into lesson_material_progress (user_id, lesson_slug, section_name, completed) values
    ('u1', 'a', 'keyPoints', true), ('u1', 'a', 'page', true), ('u1', 'c', 'page', true);
  insert into debrief_passes (user_id, lesson_slug) values ('u1', 'b');
  insert into prepared_debriefs (user_id, course_id, lesson_slug, test, source_fingerprint) values
    ('u1', 2, 'd', '{}', 'x'), ('u1', 1, 'c', '{}', 'x');
`;

const kp = (version: number, n = 2): KnowledgeChunk[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `v${version}-c${i + 1}`,
    title: `T${i + 1}`,
    summary: `S${i + 1}`,
  }));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'progress and key points by version, on Postgres',
  () => {
    let pgDb: FreshDb;
    const query = async (text: string, values: unknown[] = []) =>
      (await pgDb.pool.query(text, values)).rows;
    const mastery = async () =>
      (
        await query(
          'select user_id, chunk_id, latest_score, cleared_at is not null as cleared from debrief_chunk_mastery order by 1, 2',
        )
      ).map((r) => [r.user_id, r.chunk_id, r.latest_score, r.cleared]);
    const clear = (userId: string, lessonId: number, chunkId: string) =>
      query(
        `insert into debrief_chunk_mastery (user_id, lesson_id, chunk_id, latest_score, cleared_at) values ($1, $2, $3, 80, now())`,
        [userId, lessonId, chunkId],
      );
    const storeChunks = (
      lessonVersionId: number,
      version: number,
      lessonId = 1,
    ) =>
      upsertLessonChunks({
        lessonId,
        lessonVersionId,
        version,
        sourceFingerprint: `fp-${version}`,
        chunks: kp(version),
        previousMapping: null,
      });
    const updateCourseOne = () => retakeLesson(pgDb.db, 1, 1);
    const lessonOf = async (slug: string, lessonId: number) =>
      (await getCourseProgress({ userId: 'u1', slug })).lessons.find(
        (l) => l.lessonId === lessonId,
      );

    beforeAll(async () => {
      pgDb = await freshDb({ migrated: true });
      h.db = pgDb.db;
      vi.stubGlobal('fetch', () => {
        throw new Error('no network in tests');
      });
    });
    afterAll(async () => {
      vi.unstubAllGlobals();
      await pgDb?.drop();
    });
    beforeEach(async () => {
      vi.clearAllMocks();
      h.store.clear();
      h.generateKnowledgeChunks.mockImplementation(
        async ({ keyPoints }: { keyPoints: string[] }) =>
          keyPoints.map((p, i) => ({
            id: `c${i + 1}`,
            title: p,
            summary: p,
          })),
      );
      h.matchKnowledgeChunks.mockImplementation(
        async (was: KnowledgeChunk[], now: KnowledgeChunk[]) =>
          Object.fromEntries(was.map((c, i) => [c.id, now[i]?.id ?? null])),
      );
      h.generateTest.mockImplementation(
        async (i: {
          lessonSlug: string;
          chunks: KnowledgeChunk[];
          context: string;
          focus: { holes: string[] };
        }) => ({
          lessonSlug: i.lessonSlug,
          questions: i.focus.holes.map((chunkId, n) => ({
            id: `q${n + 1}`,
            type: 'free-text' as const,
            question: `${i.context}: ${chunkId}?`,
            expectedAnswer: 'x',
            chunkIds: [chunkId],
          })),
        }),
      );
      h.evaluateFreeText.mockImplementation(
        async (q: { id: string; chunkIds: string[] }, answer: string) => ({
          questionId: q.id,
          type: 'free-text' as const,
          score: 90,
          userAnswer: answer,
          explanation: '',
          chunkScores: { [q.chunkIds[0]]: 90 },
          revisitNote: 'Look at the load factor again',
          feedback: 'Good',
          incorrectClaims: [],
        }),
      );
      await query(SEED);
    });

    it('quiz, sections, video presence and bearing follow the pin, not the working copy', async () => {
      const facts = async (slug: string) =>
        (await getCourseProgress({ userId: 'u1', slug })).lessons.map((l) => ({
          id: l.lessonId,
          outstanding: l.outstanding,
          hasVideo: l.debrief.hasVideo,
          bearing: l.debrief.bearing,
        }));
      const section = (s: string) => ({ kind: 'section', section: s });
      expect(await facts('one')).toEqual([
        {
          id: 1,
          // Job of the Day, as frozen: TEST THIS! has links but no tab.
          outstanding: [
            { kind: 'video' },
            section('proTips'),
            section('links'),
            section('jobOfTheDay'),
          ],
          hasVideo: true,
          bearing: true,
        },
        {
          id: 2,
          outstanding: [{ kind: 'quiz' }, section('keyPoints')],
          hasVideo: false,
          bearing: true,
        },
        // Prepared once, but this version has nothing to debrief from.
        { id: 3, outstanding: [], hasVideo: false, bearing: false },
        // A prepared debrief of the other course's does not count here.
        { id: 4, outstanding: [], hasVideo: true, bearing: false },
      ]);
      expect(await facts('two')).toEqual([
        {
          id: 1,
          outstanding: [section('testThis')],
          hasVideo: false,
          bearing: true,
        },
        {
          id: 2,
          outstanding: [{ kind: 'quiz' }, section('keyPoints')],
          hasVideo: false,
          bearing: true,
        },
        { id: 3, outstanding: [], hasVideo: false, bearing: false },
        { id: 4, outstanding: [], hasVideo: true, bearing: true },
      ]);
    });

    it('gives each course its own percent, the same on the card and in the sidebar', async () => {
      const rings = async (slug: string) =>
        (await getCourseProgress({ userId: 'u1', slug })).lessons.map(
          (l) => l.ringPercent,
        );
      expect(await rings('one')).toEqual([50, 50, 100, 100]);
      expect(await rings('two')).toEqual([0, 50, 100, 50]);

      const cards = await getMyCourses('u1');
      expect(cards.map((c) => [c.slug, c.percent])).toEqual([
        ['one', 75],
        ['two', 50],
      ]);
      for (const card of cards) {
        expect(
          (await getCourseProgress({ userId: 'u1', slug: card.slug })).percent,
        ).toBe(card.percent);
      }
    });

    it('does not count a lesson the payload omits, and keeps modules with none', async () => {
      // Course one: `a` unpinned. Module 3 gains a lesson that has no pin.
      await query(
        `delete from course_lesson_versions where course_id = 1 and lesson_id = 1;
         insert into lessons (name, slug, required_subscriptions, org_id, other_video_ids, version, is_available)
           values ('E', 'e', '{}', 1, '[]', '1.0', true);
         insert into module_lessons (module_id, lesson_id, rank) values (3, 5, 1);`,
      );
      const progress = await getCourseProgress({ userId: 'u1', slug: 'one' });
      const shown = (await getCourseDetails('one'))?.modules.flatMap((m) =>
        m.lessons.map((l) => l.id),
      );
      expect(progress.lessons.map((l) => l.lessonId)).toEqual(shown);
      expect(shown).toEqual([2, 3, 4]);
      expect(progress.modules).toEqual([
        {
          moduleId: 1,
          percent: 83,
          watchedLessons: 1,
          totalLessons: 3,
        },
        { moduleId: 3, percent: 0, watchedLessons: 0, totalLessons: 0 },
      ]);
      expect(
        (await getMyCourses('u1')).map((c) => [c.slug, c.percent]),
      ).toEqual([
        ['one', 83],
        ['two', 50],
      ]);

      // A course with no pinned lesson at all still has its card.
      await query('delete from course_lesson_versions where course_id = 1');
      expect(
        (await getMyCourses('u1')).map((c) => [c.slug, c.percent]),
      ).toEqual([
        ['one', 0],
        ['two', 50],
      ]);
    });

    it('a passed debrief stays passed after the course updates; an unpassed one has chunksCleared 0', async () => {
      await query(
        `insert into debrief_passes (user_id, lesson_slug) values ('u2', 'a');
         insert into lesson_completions (user_id, lesson_id, done_at) values ('u1', 1, '2026-11-03 00:00+00');
         insert into videos_progress (user_id, lesson_id, progress, created_at)
           select 'u1', 1, p, '2026-11-04 09:00' from generate_series(55, 95, 5) p;`,
      );
      await storeChunks(1, 1);
      for (const user of ['u1', 'u2']) {
        await clear(user, 1, 'v1-c1');
        await clear(user, 1, 'v1-c2');
      }
      const facts = (userId: string, courseId = 1) =>
        getDebriefFacts(userId, 'a', 1, courseId);
      const before = await facts('u1');
      expect(before).toEqual({
        clockStartAt: '2026-11-04T09:00:00.000Z',
        passed: false,
        lastFinishedAt: null,
        hasOpenAttempt: false,
        waitServed: false,
        mastery: { cleared: 2, total: 2 },
      });
      expect(await facts('u2')).toMatchObject({
        passed: true,
        mastery: { cleared: 2, total: 2 },
      });
      // The other course's version has no key points yet, and no video.
      expect(await facts('u1', 2)).toMatchObject({
        clockStartAt: '2026-11-03T00:00:00.000Z',
        mastery: null,
      });

      await updateCourseOne();
      // The clock, the completion and the passes are the lesson's.
      expect(await facts('u1')).toEqual({ ...before, mastery: null });
      expect(await lessonOf('one', 1)).toMatchObject({
        done: true,
        debrief: { clockStartAt: before.clockStartAt, passed: false },
      });

      const updated = (
        await query(
          `select id from lesson_versions where lesson_id = 1 and version = '1.2'`,
        )
      )[0].id;
      await storeChunks(updated, 2);
      const unpassed = { cleared: 0, total: 2 };
      expect(await facts('u1')).toEqual({ ...before, mastery: unpassed });
      expect((await lessonOf('one', 1))?.debrief.mastery).toEqual(unpassed);
      expect(await facts('u2')).toMatchObject({
        passed: true,
        mastery: unpassed,
      });
      // Nothing of what they did on the old version is lost.
      expect(await mastery()).toHaveLength(4);
    });

    it('ignores key points kept from before versions, but not their number', async () => {
      await query(
        `insert into lesson_knowledge_chunks (lesson_id, version, source_fingerprint, chunks)
         values (1, 7, 'old', '${JSON.stringify(kp(7))}'), (4, 1, 'old', '${JSON.stringify(kp(1))}')`,
      );
      await clear('u1', 1, 'v7-c1');
      expect(await selectLessonChunks(1)).toBeNull();
      expect((await lessonOf('one', 1))?.debrief.mastery).toBeNull();
      expect((await lessonOf('one', 4))?.debrief.bearing).toBe(false);
      await storeChunks(5, 2, 4);
      expect((await lessonOf('one', 4))?.debrief.bearing).toBe(true);
      expect(await nextChunkVersion(1)).toBe(8);

      const made = await ensureLessonChunks(1, 'a', 1);
      expect(made).toMatchObject({
        kind: 'ready',
        version: 8,
        lessonVersionId: 1,
        chunks: [{ id: 'v8-c1' }, { id: 'v8-c2' }],
      });
      expect((await selectLessonChunks(1))?.version).toBe(8);
      expect((await lessonOf('one', 1))?.debrief.mastery).toEqual({
        cleared: 0,
        total: 2,
      });
    });

    it("regenerating snapshot 1.1's chunks leaves mastery of 1.0's chunk ids alone", async () => {
      await query(
        `update lesson_versions set key_points = '["kp1","kp2"]' where id = 2`,
      );
      await storeChunks(1, 1);
      await storeChunks(2, 2);
      for (const id of ['v1-c1', 'v1-c2', 'v2-c1', 'v2-c2']) {
        await clear('u1', 1, id);
      }
      await query(
        `update debrief_chunk_mastery set cleared_at = null where chunk_id = 'v2-c2'`,
      );

      // Course two is on 1.1; its stored source no longer matches.
      const made = await ensureLessonChunks(1, 'a', 2);
      expect(made).toMatchObject({
        kind: 'ready',
        version: 3,
        lessonVersionId: 2,
      });
      // 1.1's cleared key point carried over; its uncleared one starts again.
      expect(await mastery()).toEqual([
        ['u1', 'v1-c1', 80, true],
        ['u1', 'v1-c2', 80, true],
        ['u1', 'v3-c1', 80, true],
      ]);
      expect(await getDebriefFacts('u1', 'a', 1, 1)).toMatchObject({
        mastery: { cleared: 2, total: 2 },
      });
      expect(await getDebriefFacts('u1', 'a', 1, 2)).toMatchObject({
        mastery: { cleared: 1, total: 2 },
      });
      expect(await selectLessonChunks(1)).toMatchObject({ version: 1 });
      expect(await selectLessonChunks(2)).toMatchObject({
        version: 3,
        previousMapping: { 'v2-c1': 'v3-c1', 'v2-c2': 'v3-c2' },
      });
    });

    it('a snapshot regenerated across a gap in the numbers still carries its own mastery', async () => {
      await storeChunks(1, 1);
      await storeChunks(2, 5);
      await clear('u1', 1, 'v1-c1');
      await ensureLessonChunks(1, 'a', 1);
      expect(await mastery()).toEqual([['u1', 'v6-c1', 80, true]]);
      expect(await getDebriefFacts('u1', 'a', 1, 1)).toMatchObject({
        mastery: { cleared: 1, total: 2 },
      });
    });

    it('concurrent regeneration of two snapshots never issues the same chunk version', async () => {
      await query(
        `update lesson_versions set key_points = '["kp1"]' where id = 2`,
      );
      // Both have generated and reach their transaction together.
      let arrived = 0;
      let open = () => {};
      const gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      h.generateKnowledgeChunks.mockImplementation(async () => {
        if (++arrived === 2) open();
        await gate;
        return [{ id: 'c1', title: 't', summary: 's' }];
      });
      const made = await Promise.all([
        ensureLessonChunks(1, 'a', 1),
        ensureLessonChunks(1, 'a', 2),
      ]);
      expect(
        made.map((m) => (m.kind === 'ready' ? m.version : m.kind)).sort(),
      ).toEqual([1, 2]);

      // The one that took the number holds the next until it commits.
      let second: number | undefined;
      let waiting: Promise<number> | undefined;
      await pgDb.db.transaction(async (tx) => {
        const version = await nextChunkVersion(1, tx);
        expect(version).toBe(3);
        waiting = nextChunkVersion(1).then((v) => {
          second = v;
          return v;
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(second).toBeUndefined();
        await upsertLessonChunks(
          {
            lessonId: 1,
            lessonVersionId: 1,
            version,
            sourceFingerprint: 'x',
            chunks: kp(version),
            previousMapping: null,
          },
          tx,
        );
      });
      expect(await waiting).toBe(4);
    });

    it('a list stored while this one was being generated stands, with its mastery', async () => {
      await storeChunks(1, 1);
      await clear('u1', 1, 'v1-c1');
      h.generateKnowledgeChunks.mockImplementation(async () => {
        // The claim ran out and another request stored and carried over.
        await storeChunks(1, 2);
        await query(
          `update debrief_chunk_mastery set chunk_id = 'v2-c2' where chunk_id = 'v1-c1'`,
        );
        return [{ id: 'c1', title: 't', summary: 's' }];
      });
      expect(await ensureLessonChunks(1, 'a', 1)).toMatchObject({
        kind: 'ready',
        version: 2,
        chunks: kp(2),
      });
      expect(await selectLessonChunks(1)).toMatchObject({ version: 2 });
      expect(await getDebriefFacts('u1', 'a', 1, 1)).toMatchObject({
        mastery: { cleared: 1, total: 2 },
      });
    });

    it('regenerating waits for an answer being recorded, and neither deadlocks the other', async () => {
      await storeChunks(1, 1);
      const { selectCurrentChunks, upsertMastery } = await import(
        '../debrief-attempts'
      );
      let regenerating: ReturnType<typeof ensureLessonChunks> | undefined;
      await pgDb.db.transaction(async (tx) => {
        expect(
          await selectCurrentChunks(1, tx, { forShare: true }),
        ).toMatchObject({ version: 1 });
        regenerating = ensureLessonChunks(1, 'a', 1);
        await new Promise((resolve) => setTimeout(resolve, 300));
        // The mastery row's foreign key takes the lesson the other has locked.
        await upsertMastery(tx, [
          {
            userId: 'u1',
            lessonId: 1,
            chunkId: 'v1-c1',
            latestScore: 90,
            clearedAt: new Date(),
          },
        ]);
      });
      expect(await regenerating).toMatchObject({ kind: 'ready', version: 2 });
      expect(await mastery()).toEqual([['u1', 'v2-c1', 90, true]]);
    });

    it('an attempt opened before an update is finished on its own questions and can still pass', async () => {
      const pilot = {
        userId: 'u1',
        courseId: 1,
        lessonId: 1,
        lessonSlug: 'a',
      };
      const started = await startOrResumeAttempt(pilot);
      if (!started.ok) throw new Error(started.reason);
      const { attemptId, questions } = started.attempt;
      expect(questions).toHaveLength(2);

      await updateCourseOne();
      await ensureLessonChunks(1, 'a', 1);
      const resumed = await startOrResumeAttempt(pilot);
      expect(resumed).toMatchObject({ ok: true, attempt: { attemptId } });

      const answers = [];
      for (const q of questions) {
        answers.push(
          await answerQuestion({
            userId: 'u1',
            attemptId,
            questionId: q.id,
            answer: 'mine',
            metrics: {
              msOnQuestion: 1,
              msToFirstKey: 1,
              deletions: 0,
              charsDeleted: 0,
              rewrites: 0,
              pasteBlocked: 0,
              msHidden: 0,
              finalLength: 4,
            },
            lessonId: 1,
            courseId: 1,
          }),
        );
      }
      expect(answers.at(-1)).toMatchObject({
        ok: true,
        finished: 'set-passed',
        passedNow: true,
      });
      // Graded from the version it was asked about.
      expect(h.evaluateFreeText.mock.calls[0][3]).toBe('a text 1.0');
      expect(await mastery()).toEqual([]);
      expect(await getDebriefFacts('u1', 'a', 1, 1)).toMatchObject({
        passed: true,
        hasOpenAttempt: false,
        waitServed: true,
      });
      // What it showed is read from the attempt itself, in either course.
      expect(await getDebriefAttemptReports('u1', 'a')).toMatchObject([
        { id: attemptId, passed: true, totalScore: 90 },
      ]);
      expect(await findRecentDebriefGaps('u1')).toEqual([
        {
          lessonName: 'A',
          notes: ['Look at the load factor again'],
          incorrect: [],
        },
      ]);
    });

    it('an answer in the other course records nothing against its version', async () => {
      const started = await startOrResumeAttempt({
        userId: 'u1',
        courseId: 1,
        lessonId: 1,
        lessonSlug: 'a',
      });
      if (!started.ok) throw new Error(started.reason);
      const answer = (questionId: string, courseId: number) =>
        answerQuestion({
          userId: 'u1',
          attemptId: started.attempt.attemptId,
          questionId,
          answer: 'mine',
          metrics: {
            msOnQuestion: 1,
            msToFirstKey: 1,
            deletions: 0,
            charsDeleted: 0,
            rewrites: 0,
            pasteBlocked: 0,
            msHidden: 0,
            finalLength: 4,
          },
          lessonId: 1,
          courseId,
        });
      await storeChunks(2, 2);
      await answer('q1', 2);
      expect(await mastery()).toEqual([]);
      await answer('q2', 1);
      expect(await mastery()).toEqual([
        ['u1', expect.stringMatching(/^v1-c[12]$/), 90, true],
      ]);
    });

    it('a prepared debrief belongs to one course and the version it was prepared from', async () => {
      await query(
        `update lesson_versions set key_points = '["kp1"]' where id = 2;
         delete from prepared_debriefs;`,
      );
      const pilot = (courseId: number) => ({
        userId: 'u1',
        courseId,
        lessonSlug: 'a',
        lessonId: 1,
      });
      expect(await prepareDebrief(pilot(1))).toBe('prepared');
      expect(await prepareDebrief(pilot(2))).toBe('prepared');
      expect(
        await query('select course_id from prepared_debriefs order by 1'),
      ).toEqual([{ course_id: 1 }, { course_id: 2 }]);
      h.generateTest.mockClear();

      // Course one updates; its prepared test is of the version it left.
      await updateCourseOne();
      const one = await startOrResumeAttempt(pilot(1));
      if (!one.ok) throw new Error(one.reason);
      expect(h.generateTest).toHaveBeenCalledTimes(1);
      expect(one.attempt.questions[0].question).toContain('a working');
      expect(
        await query('select course_id from prepared_debriefs order by 1'),
      ).toEqual([{ course_id: 2 }]);

      // Course two's is untouched and still served.
      await query('delete from lesson_test_results');
      h.generateTest.mockClear();
      const two = await startOrResumeAttempt(pilot(2));
      if (!two.ok) throw new Error(two.reason);
      expect(h.generateTest).not.toHaveBeenCalled();
      expect(two.attempt.questions[0].question).toContain('a text 1.1');
    });

    it('never serves a test under another version, whatever its key point number', async () => {
      const key = { userId: 'u1', courseId: 1, lessonSlug: 'a' };
      const test = {
        lessonSlug: 'a',
        questions: [
          {
            id: 'q1',
            type: 'free-text',
            question: '?',
            expectedAnswer: 'x',
            chunkIds: ['v1-c1'],
          },
        ],
      };
      await pgDb.db.insert(schema.preparedDebriefsTable).values({
        ...key,
        test,
        sourceFingerprint: preparedFingerprint(1, 1, []),
      });
      expect(
        await takePreparedDebrief(key, preparedFingerprint(2, 1, [])),
      ).toBeNull();
      expect(
        await pgDb.db
          .select()
          .from(schema.preparedDebriefsTable)
          .where(eq(schema.preparedDebriefsTable.lessonSlug, 'a')),
      ).toEqual([]);
    });

    describe('an unpassed debrief starts over on another version', () => {
      const questions = ['q1', 'q2', 'q3', 'q4', 'q5'].map(
        (id) => JSON.parse(quiz(id))[0],
      );
      const five = JSON.stringify(questions);
      const perfect = questions.map((q) => ({
        ...q,
        userOptionId: q.correctOptionId,
      }));
      const metrics = {
        msOnQuestion: 1,
        msToFirstKey: 1,
        deletions: 0,
        charsDeleted: 0,
        rewrites: 0,
        pasteBlocked: 0,
        msHidden: 0,
        finalLength: 4,
      };
      const start = async (courseId: number) => {
        const started = await startOrResumeAttempt({
          userId: 'u1',
          courseId,
          lessonId: 1,
          lessonSlug: 'a',
        });
        if (!started.ok) throw new Error(started.reason);
        return started.attempt;
      };
      /** Answer everything still open in the attempt, every answer scoring 60. */
      const finish = async (courseId: number) => {
        const attempt = await start(courseId);
        let last: Awaited<ReturnType<typeof answerQuestion>> | undefined;
        const done = new Set(attempt.answered.map((a) => a.questionId));
        for (const q of attempt.questions.filter((x) => !done.has(x.id))) {
          last = await answerQuestion({
            userId: 'u1',
            attemptId: attempt.attemptId,
            questionId: q.id,
            answer: 'mine',
            metrics,
            lessonId: 1,
            courseId,
          });
        }
        return last;
      };
      /** A perfect quiz, through the route: what it answers about promotion. */
      const takeQuiz = async (courseSlug: string) => {
        const res = await submitLessonQuizHandler(
          new Request('http://t/api/lesson/quiz/answers', {
            method: 'POST',
            body: JSON.stringify({
              lessonSlug: 'a',
              courseSlug,
              answers: perfect,
            }),
          }),
        );
        expect(res.status).toBe(200);
        return (await res.json()).promotion;
      };
      const status = async (courseSlug: string) =>
        (
          await debriefStatusHandler(
            new Request(
              `http://t/api/lesson/debrief-status?lessonSlug=a&courseSlug=${courseSlug}`,
            ),
          )
        ).json();
      const passes = async () =>
        (
          await query(
            `select 1 from debrief_passes where user_id = 'u1' and lesson_slug = 'a'`,
          )
        ).length;
      const levels = async (courseId: number) =>
        (
          await query(
            'select level from user_levels where course_id = $1 order by id',
            [courseId],
          )
        ).map((l) => l.level);
      const badge = async (slug: string) => {
        const debrief = (await lessonOf(slug, 1))?.debrief;
        if (!debrief) throw new Error('no lesson');
        return computeDebriefState(debrief, new Date());
      };
      const fresh = {
        kind: 'open',
        retake: false,
        resume: false,
        passed: false,
      };

      // Lesson `a` is the whole of the basic tier, done but for its debrief.
      // Every version asks the same five-question quiz, so the mark is 75.
      beforeEach(async () => {
        h.evaluateFreeText.mockImplementation(
          async (q: { id: string; chunkIds: string[] }, answer: string) => ({
            questionId: q.id,
            type: 'free-text' as const,
            score: 60,
            userAnswer: answer,
            explanation: '',
            chunkScores: { [q.chunkIds[0]]: 60 },
            revisitNote: 'Look at the load factor again',
            feedback: 'Hm',
            incorrectClaims: [],
          }),
        );
        await query(
          `update courses set pass_mark = 75;
           -- Only a 3D Airmanship lesson counts towards a level.
           update disciplines set slug = '3d-airmanship';
           update lessons set levels = '{none}';
           update lessons set levels = '{basic}' where id = 1;
           update lessons set levels = '{intermediate}' where id = 2;
           update lesson_versions set quiz = '${five}', key_points = '["kp1","kp2"]',
             video_provider = 'mux', video_ref = 'v' where lesson_id = 1;
           update lesson_material set quiz = '${five}' where lesson_slug = 'a';
           delete from lesson_quiz_answers;
           delete from prepared_debriefs;
           insert into lesson_completions (user_id, lesson_id, done_at) values ('u1', 1, '2026-11-03 00:00+00');
           insert into videos_progress (user_id, lesson_id, progress, created_at)
             select 'u1', 1, p, '2026-11-04 09:00' from generate_series(55, 95, 5) p;
           insert into user_levels (user_id, course_id, level, source) values
             ('u1', 1, 'basic', 'admin'), ('u1', 2, 'basic', 'admin');`,
        );
      });

      it('a finished set passes with a quiz taken later on the same version', async () => {
        expect(await finish(1)).toMatchObject({ finished: 'sets-missed' });
        expect(await passes()).toBe(0);
        expect(await takeQuiz('one')).toMatchObject({ to: 'intermediate' });
        expect(await passes()).toBe(1);
        expect(await levels(1)).toEqual(['basic', 'intermediate']);
      });

      it('a set from before an update passes nothing, and promotes nobody', async () => {
        await finish(1);
        await updateCourseOne();
        expect(await takeQuiz('one')).toBeNull();
        expect(await passes()).toBe(0);
        expect(await levels(1)).toEqual(['basic']);

        // A set of the version now shown does count.
        expect(await finish(1)).toMatchObject({
          finished: 'set-passed',
          passedNow: true,
        });
      });

      it('in two courses on different versions, each counts its own sets', async () => {
        await finish(1);
        expect(await takeQuiz('two')).toBeNull();
        expect(await passes()).toBe(0);
        expect(await status('two')).toMatchObject({ state: fresh });
        expect(await status('one')).toMatchObject({
          state: { ...fresh, retake: true },
          lastAttempt: { score: 60 },
        });
        // Saved in course one, the same quiz lifts course one's set.
        expect(await takeQuiz('one')).toMatchObject({ to: 'intermediate' });
        expect(await passes()).toBe(1);
      });

      it("between attempts, shows the last one of this course's version, not a newer one of the other's", async () => {
        await finish(1);
        await finish(2);
        const scores = async () =>
          (
            await query(
              `select questions ->> 'lessonVersionId' as version, total_score from lesson_test_results order by id`,
            )
          ).map((r) => [r.version, r.total_score]);
        expect(await scores()).toEqual([
          ['1', 60],
          ['2', 60],
        ]);
        await query(
          `update lesson_test_results set total_score = 40 where questions ->> 'lessonVersionId' = '2'`,
        );
        expect((await status('one')).lastAttempt.score).toBe(60);
        expect((await status('two')).lastAttempt.score).toBe(40);
      });

      it('an open attempt keeps the version it was made from through every write', async () => {
        const attempt = await start(1);
        await answerQuestion({
          userId: 'u1',
          attemptId: attempt.attemptId,
          questionId: attempt.questions[0].id,
          answer: 'mine',
          metrics,
          lessonId: 1,
          courseId: 1,
        });
        await updateCourseOne();
        // Resumed and finished after the update, still of 1.0.
        expect((await start(1)).attemptId).toBe(attempt.attemptId);
        expect((await status('one')).state).toMatchObject({ resume: true });
        expect(await finish(1)).toMatchObject({ finished: 'sets-missed' });
        const [row] = await query(
          `select questions ->> 'lessonVersionId' as version, questions -> 'setVerdicts' as verdicts from lesson_test_results`,
        );
        // The verdicts are written with the whole snapshot.
        expect(row).toEqual({ version: '1', verdicts: [false] });
        expect(await takeQuiz('one')).toBeNull();
        expect(await passes()).toBe(0);
        expect(await status('one')).toMatchObject({ state: fresh });
      });

      it('a test prepared beforehand is an attempt on the version it was prepared from', async () => {
        await prepareDebrief({
          userId: 'u1',
          courseId: 2,
          lessonSlug: 'a',
          lessonId: 1,
        });
        h.generateTest.mockClear();
        await start(2);
        expect(h.generateTest).not.toHaveBeenCalled();
        expect(
          await query(
            `select questions ->> 'lessonVersionId' as version from lesson_test_results`,
          ),
        ).toEqual([{ version: '2' }]);
      });

      it('an attempt from before versions belongs to the first snapshot only', async () => {
        await finish(1);
        await query(
          `update lesson_test_results set questions = (questions::jsonb - 'lessonVersionId')::json`,
        );
        expect(await status('one')).toMatchObject({
          state: { ...fresh, retake: true },
          lastAttempt: { score: 60 },
        });
        expect(await status('two')).toMatchObject({ state: fresh });
        expect(await takeQuiz('two')).toBeNull();
        expect(await passes()).toBe(0);
        expect(await takeQuiz('one')).toMatchObject({ to: 'intermediate' });
        expect(await passes()).toBe(1);

        // The first of ITS lesson's snapshots, and the oldest format too.
        await query(
          `insert into lesson_test_results (user_id, lesson_slug, questions, total_score, completed_at)
           values ('u1', 'd', '[]', 50, '2026-11-05 10:00')`,
        );
        expect((await lessonOf('one', 4))?.debrief.lastFinishedAt).toBe(
          '2026-11-05T10:00:00.000Z',
        );
      });

      it('shows nothing of an old version until it is passed, and does not restart the wait', async () => {
        await finish(1);
        expect(await badge('one')).toEqual({ ...fresh, retake: true });
        expect(await status('one')).toMatchObject({
          state: { ...fresh, retake: true },
          lastAttempt: { score: 60, setAverages: [60] },
          revisitNotes: ['Look at the load factor again'],
        });

        await updateCourseOne();
        // Open at once: the clock had run out on the old version.
        expect(await status('one')).toEqual({
          state: fresh,
          lessonOutstanding: [],
        });
        expect(await badge('one')).toEqual(fresh);
        // Viper still knows what they missed.
        expect(await findRecentDebriefGaps('u1')).toHaveLength(1);

        // Passed: every finished attempt shows, the old version's too.
        h.evaluateFreeText.mockImplementation(
          async (q: { id: string; chunkIds: string[] }, answer: string) => ({
            questionId: q.id,
            type: 'free-text' as const,
            score: 90,
            userAnswer: answer,
            explanation: '',
            chunkScores: { [q.chunkIds[0]]: 90 },
            revisitNote: '',
            feedback: 'Good',
            incorrectClaims: [],
          }),
        );
        expect(await finish(1)).toMatchObject({ finished: 'set-passed' });
        const passed = await status('one');
        expect(passed.state).toEqual({ kind: 'passed' });
        expect(
          passed.attempts.map((a: { totalScore: number }) => a.totalScore),
        ).toEqual([90, 60]);
      });

      it('a pilot whose clock ran out without an attempt starts at once after an update', async () => {
        expect((await status('one')).state).toEqual(fresh);
        await updateCourseOne();
        expect((await status('one')).state).toEqual(fresh);
      });

      it('a pilot who has finished an attempt never waits again, whatever an update does to the clock', async () => {
        await finish(1);
        // The new version is a video they have not watched in full.
        await query('delete from videos_progress where progress = 95');
        await updateCourseOne();
        expect((await status('one')).state).toEqual(fresh);
        expect(await badge('one')).toEqual(fresh);
      });
    });
  },
);
