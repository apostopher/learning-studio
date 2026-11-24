// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LessonMaterialGeneration } from '#/types';
import { type FreshDb, freshDb } from './support/local-pg';

const h = vi.hoisted(() => {
  /** Everything Redis holds. Like Upstash, `get` hands back parsed JSON. */
  const store = new Map<string, string>();
  const redis = {
    get: async (key: string) => {
      const value = store.get(key);
      if (value === undefined) return null;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    },
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
    redis,
    dbModule: () => ({
      get db() {
        return h.db;
      },
    }),
    embed: vi.fn(),
    embedMany: vi.fn(),
    resolvePlayback: vi.fn(),
    generateKnowledgeChunks: vi.fn(),
    matchKnowledgeChunks: vi.fn(),
  };
});
vi.mock('#/db', () => h.dbModule());
vi.mock('@/db', () => h.dbModule());
vi.mock('@/db/schema', () => vi.importActual('#/db/schema'));
// The CLIENT is faked, not the cache: an entry nobody evicts stays served.
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: () => h.redis } }));
vi.mock('@/integrations/upstash/redis', () =>
  vi.importActual('#/integrations/upstash/redis'),
);
// Nothing leaves the machine.
vi.mock('ai', () => ({
  embed: h.embed,
  embedMany: h.embedMany,
  tool: (definition: unknown) => definition,
}));
vi.mock('#/ai/gemini', () => ({ embeddingModel: 'embedding-model' }));
vi.mock('#/ai/generate-knowledge-chunks', () => ({
  generateKnowledgeChunks: h.generateKnowledgeChunks,
}));
vi.mock('#/ai/match-knowledge-chunks', () => ({
  matchKnowledgeChunks: h.matchKnowledgeChunks,
}));
vi.mock('#/db/derived-key-points', () => ({
  getDerivedKeyPoints: async () => [],
}));
vi.mock('#/lib/video-providers/resolve.server', () => ({
  resolvePlayback: h.resolvePlayback,
  validateCredentials: vi.fn(),
}));
vi.mock('#/db/video-captions', () => ({ muxCaptionsForPlayback: vi.fn() }));
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: vi.fn(),
}));
vi.mock('#/lib/crypto.server', () => ({
  decryptJson: (secrets: unknown) => secrets,
  encryptJson: (secrets: unknown) => secrets,
}));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));

const { migrateLessonVersions } = await import('../migrate-lesson-versions');
const { getCourseDetailsWithCache } = await import('../course');
const { getCourseLessonMaterial } = await import('../course-lesson-content');
const { getCourseProgress } = await import('../course-progress');
const { getLessonPlayback } = await import('../lesson-playback');
const { VersionEditError } = await import('../lesson-content-edit');
const { getLessonMaterialByLessonId, upsertLessonMaterial } = await import(
  '../lesson'
);
const {
  createCourse,
  deleteLesson,
  removeLessonAlternateVideo,
  setLessonAlternateVideo,
  setLessonVideo,
  updateLessonName,
} = await import('../admin');
const { updateCourseLessonVersion } = await import('../lesson-versions');
const { linkLesson, unlinkLesson } = await import('../placements');
const { getScoreFacts } = await import('#/lib/lesson-score.server');
const { chunkFingerprint, ensureLessonChunks } = await import(
  '#/lib/knowledge-chunks.server'
);
const { indexLessonVersions, unindexedLessonVersionIds } = await import(
  '#/lib/index-lesson-versions.server'
);
const { makeSearchKBTool } = await import('#/ai/tools/search-kb');

const VECTOR = Array.from({ length: 3072 }, (_, i) => (i === 0 ? 1 : 0));
const VECTOR_SQL = `'[${VECTOR.join(',')}]'`;
/** Captions long enough to debrief from, naming the video they are of. */
const spoken = (ref: string) => `${ref} `.repeat(60).trim();
const quiz = (id: string): LessonMaterialGeneration['quiz'] => [
  {
    id,
    question: `Q ${id}`,
    options: [
      { id: 'a', value: 'A' },
      { id: 'b', value: 'B' },
    ],
    correctOptionId: 'a',
  } as NonNullable<LessonMaterialGeneration['quiz']>[number],
];
const FINGERPRINT_A = chunkFingerprint({
  keyPoints: ['stalls'],
  context: spoken('a-ref-1.0'),
});

/**
 * The database as production has it today, before the migration. Course 1 is
 * the flagship and owns module 1 (lessons 1 `a` and 2 `b`); course 2 borrows
 * it; course 3 owns module 2, which also holds `a`. Lesson 3 (`c`) is in no
 * course. u1 has finished everything on `a` and passed its debrief; u2 has
 * taken it once and missed it.
 */
const SEED = `
  insert into organizations (name) values ('Org');
  insert into disciplines (org_id, name, slug) values (1, 'UAS', 'uas');
  insert into courses (name, slug) values
    ('Flagship', '3d-airmanship'), ('Two', 'two'), ('Three', 'three');
  insert into course_orgs (course_id, org_id) values (1, 1), (2, 1), (3, 1);
  insert into course_video_providers (course_id, provider, secrets) values
    (1, 'mux', '{"of":1}'), (2, 'mux', '{"of":2}'), (3, 'mux', '{"of":3}');
  insert into modules (course_id, name, slug, required_subscriptions) values
    (1, 'M1', 'm1', '{}'), (3, 'M2', 'm2', '{}');
  insert into course_modules (course_id, module_id, rank) values
    (1, 1, 1), (2, 1, 1), (3, 2, 1);
  insert into course_remixes (course_id, source_course_id) values (2, 1);
  insert into lessons (name, slug, required_subscriptions, org_id, discipline_id,
      video_provider, video_ref, other_video_ids, is_available, levels) values
    ('A one', 'a', '{}', 1, 1, 'mux', 'a-ref-1.0',
      '[{"lang":"hi","provider":"mux","ref":"a-hi-1.0"}]', true, '{basic}'),
    ('B', 'b', '{}', 1, 1, null, null, '[]', true, '{basic}'),
    ('C', 'c', '{}', 1, 1, null, null, '[]', true, '{basic}');
  insert into module_lessons (module_id, lesson_id, rank) values
    (1, 1, 1), (1, 2, 2), (2, 1, 1);
  insert into lesson_material (lesson_slug, text, key_points, quiz, pro_tips) values
    ('a', 'a text 1.0', '["stalls"]', '${JSON.stringify(quiz('q1'))}', null),
    ('b', 'b text', null, null, null);
  insert into lesson_knowledge_chunks (lesson_id, version, source_fingerprint, chunks)
    values (1, 4, '${FINGERPRINT_A}', '[{"id":"v4-c1","title":"Stalls","summary":"s"}]');
  insert into docs (course_id, lesson_slug, source_path, heading, chunk, embedding) values
    (null, 'a', 'lesson:a', 'h', 'indexed a 1.0', ${VECTOR_SQL}),
    (null, 'b', 'lesson:b', 'h', 'indexed b', ${VECTOR_SQL}),
    (1, null, 'file-one.pdf', 'h', 'upload of course 1', ${VECTOR_SQL});
  insert into user_profiles (user_id, email) values ('u1', 'u1@t.t'), ('u2', 'u2@t.t');
  insert into course_subscriptions (user_id, course_id)
    select u, c from unnest(array['u1', 'u2']) u, generate_series(1, 3) c;
  insert into user_levels (user_id, course_id, level, source)
    select 'u1', c, 'basic', 'assigned' from generate_series(1, 3) c;
  insert into videos_progress (user_id, lesson_id, progress, created_at)
    select 'u1', 1, p, '2026-11-01 08:00' from generate_series(10, 95, 5) p;
  insert into lesson_material_progress (user_id, lesson_slug, section_name, completed) values
    ('u1', 'a', 'keyPoints', true), ('u1', 'a', 'page', true);
  insert into lesson_quiz_answers (user_id, lesson_slug, answers) values
    ('u1', 'a', '[{"id":"q1","userOptionId":"a"}]');
  insert into lesson_completions (user_id, lesson_id, done_at)
    values ('u1', 1, '2026-11-01 09:00');
  insert into debrief_passes (user_id, lesson_slug) values ('u1', 'a');
  insert into debrief_chunk_mastery (user_id, lesson_id, chunk_id, latest_score, cleared_at)
    values ('u2', 1, 'v4-c1', 90, now());
  insert into lesson_test_results (user_id, lesson_slug, questions, answers, total_score,
      completed_at, format, chunk_version, finished_reason) values
    ('u2', 'a', '{"lessonSlug":"a","questions":[]}', '[]', 40, '2026-11-02 09:00',
      'knowledge-chunks-v1', 4, 'sets-missed');
`;

/** Everything the migration and the app keep about versions, row by row. */
const STORED = [
  'select * from lessons order by id',
  'select * from lesson_material order by id',
  'select * from lesson_versions order by id',
  'select * from course_lesson_versions order by course_id, lesson_id',
  'select * from lesson_knowledge_chunks order by id',
  'select id, course_id, lesson_slug, lesson_version_id, source_path, chunk from docs order by id',
];

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'lesson versions end to end, on Postgres',
  () => {
    let pgDb: FreshDb;
    const rows = async (q: string) => (await pgDb.pool.query(q)).rows;
    const stored = () => Promise.all(STORED.map(rows));
    const pins = async () =>
      (
        await rows(`select p.course_id, l.slug, v.version
          from course_lesson_versions p
          join lessons l on l.id = p.lesson_id
          join lesson_versions v on v.id = p.lesson_version_id and v.lesson_id = l.id
          order by 1, 2`)
      ).map((p) => `${p.course_id} ${p.slug}@${p.version}`);
    const errorOf = async (edit: Promise<unknown>) => {
      const error = await edit.then(
        () => null,
        (e) => e,
      );
      expect(error).toBeInstanceOf(VersionEditError);
      return (error as InstanceType<typeof VersionEditError>).body.error;
    };

    /** Lesson `a` as each of its consumers gets it, in one course. */
    const viewOf = async (courseId: number, courseSlug: string) => {
      const lesson = async (userId: string) => {
        const p = (
          await getCourseProgress({ userId, slug: courseSlug })
        ).lessons.find((l) => l.lessonId === 1);
        return p && { ...p, moduleId: undefined };
      };
      const details = await getCourseDetailsWithCache(courseSlug);
      const listed = details?.modules
        .flatMap((m) => m.lessons)
        .find((l) => l.slug === 'a');
      const { createdAt, updatedAt, ...material } =
        (await getCourseLessonMaterial('a', courseId)) ?? {};
      const search = makeSearchKBTool({ userId: 'u1', courseSlug });
      return {
        listed: listed && {
          name: listed.name,
          hasVideo: listed.hasVideo,
          videoRef: listed.videoRef,
          otherVideoIds: listed.otherVideoIds,
        },
        material,
        score: await getScoreFacts('u1', 'a', courseId),
        english: await getLessonPlayback('a', { courseId }),
        hindi: await getLessonPlayback('a', { courseId, lang: 'hi' }),
        finished: await lesson('u1'),
        unpassed: await lesson('u2'),
        chunks: await ensureLessonChunks(1, 'a', courseId),
        viper: await (search.execute as (i: unknown) => Promise<string>)({
          query: 'what is a stall',
        }),
      };
    };
    const views = async () => ({
      one: await viewOf(1, '3d-airmanship'),
      two: await viewOf(2, 'two'),
      three: await viewOf(3, 'three'),
    });

    beforeAll(async () => {
      pgDb = await freshDb({ migrated: false });
      h.db = pgDb.db;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          const { hostname, pathname } = new URL(url);
          if (hostname !== 'captions.test') {
            throw new Error(`no network in tests: ${url}`);
          }
          return new Response(
            `WEBVTT\n\n00:00.000 --> 00:01.000\n${spoken(pathname.slice(1))}\n`,
          );
        }),
      );
      h.embed.mockResolvedValue({ embedding: VECTOR });
      h.embedMany.mockImplementation(
        async ({ values }: { values: string[] }) => ({
          embeddings: values.map(() => VECTOR),
        }),
      );
      h.resolvePlayback.mockImplementation(
        async (_provider, ref: string, creds: { of: number }) => ({
          status: 'ready',
          url: `https://cdn.test/${creds.of}/${ref}`,
          kind: 'hls',
          expiresInSeconds: 3600,
          poster: null,
          captions: { vtt: `https://captions.test/${ref}` },
        }),
      );
      h.generateKnowledgeChunks.mockImplementation(
        async ({ keyPoints }: { keyPoints: string[] }) =>
          keyPoints.map((p, i) => ({ id: `c${i + 1}`, title: p, summary: p })),
      );
    });
    afterAll(async () => {
      vi.unstubAllGlobals();
      await pgDb?.drop();
    });

    // One walk, in the order it happens in production: each step starts from
    // the state the last one left.
    it('walks a lesson from before the migration to its second version', async () => {
      await pgDb.pool.query(SEED);

      // --- The migration.
      await migrateLessonVersions(pgDb.db);
      expect(await pins()).toEqual([
        '1 a@1.0',
        '1 b@1.0',
        '2 a@1.0',
        '2 b@1.0',
        '3 a@1.0',
      ]);
      const before = await views();
      const [{ id: a10 }] = await rows(
        `select id from lesson_versions where lesson_id = 1`,
      );
      expect(before.one).toMatchObject({
        listed: {
          name: 'A one',
          hasVideo: true,
          videoRef: 'a-ref-1.0',
          otherVideoIds: [{ lang: 'hi', provider: 'mux', ref: 'a-hi-1.0' }],
        },
        material: {
          text: 'a text 1.0',
          keyPoints: ['stalls'],
          quiz: quiz('q1'),
        },
        score: { quiz: { correct: 1, total: 1 } },
        english: {
          url: 'https://cdn.test/1/a-ref-1.0',
          languages: ['en', 'hi'],
        },
        hindi: { url: 'https://cdn.test/1/a-hi-1.0', lang: 'hi' },
        finished: {
          percent: 100,
          ringPercent: 100,
          watched: true,
          done: true,
          outstanding: [],
          debrief: { passed: true, bearing: true, hasVideo: true },
        },
        unpassed: {
          done: false,
          debrief: {
            passed: false,
            lastFinishedAt: '2026-11-02T09:00:00.000Z',
            mastery: { cleared: 1, total: 1 },
          },
        },
        // The list stored before the migration, not a new one.
        chunks: {
          kind: 'ready',
          lessonVersionId: a10,
          version: 4,
          chunks: [{ id: 'v4-c1', title: 'Stalls', summary: 's' }],
        },
      });
      expect(before.one.viper).toContain('indexed a 1.0');
      expect(before.one.viper).toContain('upload of course 1');
      expect(before.three.viper).toContain('indexed a 1.0');
      expect(before.three.viper).not.toContain('indexed b');
      expect(before.three.viper).not.toContain('upload of course 1');
      // Each course plays it through its own credentials; all else is shared.
      expect(
        before.two.english?.status === 'ready' && before.two.english.url,
      ).toBe('https://cdn.test/2/a-ref-1.0');
      for (const course of [before.two, before.three]) {
        for (const key of [
          'listed',
          'material',
          'score',
          'finished',
          'unpassed',
          'chunks',
        ] as const) {
          expect(course[key]).toEqual(before.one[key]);
        }
      }
      // Nothing was rebuilt or re-embedded for it.
      expect(h.generateKnowledgeChunks).not.toHaveBeenCalled();
      expect(h.embedMany).not.toHaveBeenCalled();
      expect(await unindexedLessonVersionIds()).toEqual([]);

      // --- An edit of 1.0 is refused, whatever it edits.
      const unedited = await stored();
      const material: LessonMaterialGeneration = {
        text: 'a text 1.1 is about spins and how to recover',
        keyPoints: ['spins', 'recovery'],
        proTips: 'pro tip 1.1',
        quiz: quiz('q2'),
      };
      const hindi = { lang: 'hi', provider: 'mux', ref: 'a-hi-1.1' } as const;
      const edits: ((version?: string) => Promise<unknown>)[] = [
        (v) => upsertLessonMaterial(1, material, v),
        (v) => updateLessonName(1, 'A two', v),
        (v) => setLessonVideo(1, 'mux', 'a-ref-1.1', v),
        (v) => setLessonAlternateVideo(1, hindi, v),
        (v) => removeLessonAlternateVideo(1, 'hi', v),
      ];
      for (const edit of edits) {
        for (const version of [undefined, '1.0']) {
          expect(await errorOf(edit(version))).toBe(
            'v1.0 is used by 3 courses. Enter a higher version to make changes.',
          );
        }
        expect(await errorOf(edit('0.9'))).toBe(
          'Enter a version higher than v1.0.',
        );
      }
      expect(await stored()).toEqual(unedited);
      // A lesson in no course stays free.
      expect(await updateLessonName(3, 'C edited')).toMatchObject({ id: 3 });

      // --- Bump and change in one step; 1.1 is then free until taken.
      expect(await upsertLessonMaterial(1, material, '1.1')).toMatchObject({
        text: material.text,
      });
      await updateLessonName(1, 'A two');
      await setLessonVideo(1, 'mux', 'a-ref-1.1');
      await removeLessonAlternateVideo(1, 'hi');
      expect((await getLessonMaterialByLessonId(1))?.material?.text).toBe(
        material.text,
      );
      // No course changed in any way, with warm caches or cold.
      expect(await views()).toEqual(before);
      h.store.clear();
      expect(await views()).toEqual(before);
      expect(h.generateKnowledgeChunks).not.toHaveBeenCalled();

      // --- One course moves.
      expect(
        await updateCourseLessonVersion({
          courseId: 1,
          lessonId: 1,
          toVersion: '1.0',
        }),
      ).toEqual({ ok: false, reason: 'stale' });
      const update = { courseId: 1, lessonId: 1, toVersion: '1.1' };
      const moved = await updateCourseLessonVersion(update);
      if (!moved.ok) throw new Error(moved.reason);
      const [a11] = moved.createdVersionIds;
      expect(moved).toEqual({
        ok: true,
        version: '1.1',
        createdVersionIds: [expect.any(Number)],
      });
      expect(await updateCourseLessonVersion(update)).toEqual({
        ok: false,
        reason: 'current',
      });
      expect(await unindexedLessonVersionIds()).toEqual([a11]);
      expect(await indexLessonVersions(moved.createdVersionIds)).toEqual({
        indexed: 1,
        failed: [],
      });

      const after = await views();
      expect(after.one).toMatchObject({
        listed: {
          name: 'A two',
          hasVideo: true,
          videoRef: 'a-ref-1.1',
          otherVideoIds: [],
        },
        material: {
          text: material.text,
          keyPoints: material.keyPoints,
          proTips: material.proTips,
          quiz: quiz('q2'),
        },
        // Answered another question: the new one is not yet right.
        score: { quiz: { correct: 0, total: 1 } },
        english: { url: 'https://cdn.test/1/a-ref-1.1', languages: ['en'] },
        hindi: { url: 'https://cdn.test/1/a-ref-1.1', lang: 'en' },
        // What they did carries over; the new tab is what is left.
        finished: {
          watched: true,
          done: true,
          outstanding: [{ kind: 'section', section: 'proTips' }],
          debrief: { passed: true },
        },
        // An unpassed debrief starts over.
        unpassed: {
          debrief: { passed: false, lastFinishedAt: null },
        },
        chunks: {
          kind: 'ready',
          lessonVersionId: a11,
          version: 5,
          chunks: [
            { id: 'v5-c1', title: 'spins' },
            { id: 'v5-c2', title: 'recovery' },
          ],
          context: spoken('a-ref-1.1'),
        },
      });
      expect(h.generateKnowledgeChunks.mock.calls).toEqual([
        [{ keyPoints: material.keyPoints, context: spoken('a-ref-1.1') }],
      ]);
      expect(after.one.viper).toContain(material.text);
      expect(after.one.viper).not.toContain('indexed a 1.0');
      expect(after.one.viper).toContain('upload of course 1');
      // No learner surface names a version.
      for (const sent of [after.one.listed, after.one.material]) {
        expect(sent).not.toHaveProperty('version');
        expect(sent).not.toHaveProperty('contentUpdatedAt');
      }
      expect(after.one.viper).not.toMatch(/@1\.[01]/);
      // The owner moved; its borrower and the other course did not, and u2's
      // key point there is still cleared.
      expect(after.two).toEqual(before.two);
      expect(after.three).toEqual(before.three);
      expect(after.three.unpassed?.debrief.mastery).toEqual({
        cleared: 1,
        total: 1,
      });
      // --- Now 1.1 is taken too.
      expect(await errorOf(updateLessonName(1, 'A three'))).toBe(
        'v1.1 is used by 1 course. Enter a higher version to make changes.',
      );

      // --- A new course takes the current versions.
      const created = await createCourse({ name: 'Four' }, 1);
      expect(created.createdVersionIds).toEqual([]);
      await pgDb.pool.query(`
        insert into course_video_providers (course_id, provider, secrets)
          values (${created.id}, 'mux', '{"of":4}');
        insert into course_subscriptions (user_id, course_id)
          values ('u1', ${created.id}), ('u2', ${created.id});
        insert into user_levels (user_id, course_id, level, source)
          values ('u1', ${created.id}, 'basic', 'assigned');`);
      expect(await pins()).toEqual([
        '1 a@1.1',
        '1 b@1.0',
        '2 a@1.0',
        '2 b@1.0',
        '3 a@1.0',
        `${created.id} a@1.1`,
        `${created.id} b@1.0`,
      ]);
      const four = await viewOf(created.id, created.slug);
      const one = await viewOf(1, '3d-airmanship');
      for (const key of [
        'listed',
        'material',
        'score',
        'finished',
        'unpassed',
        'chunks',
      ] as const) {
        expect(four[key]).toEqual(one[key]);
      }
      expect(one.unpassed?.debrief.mastery).toEqual({ cleared: 0, total: 2 });
      expect(four.viper).toContain(material.text);
      expect(h.generateKnowledgeChunks).toHaveBeenCalledTimes(1);

      // --- A lesson a course uses cannot be deleted.
      expect(await deleteLesson(1)).toEqual({
        ok: false,
        reason: 'in-use',
        courses: [
          { id: 1, name: 'Flagship' },
          { id: created.id, name: 'Four' },
          { id: 3, name: 'Three' },
          { id: 2, name: 'Two' },
        ],
      });

      // --- Running the migration again changes nothing.
      const settled = await stored();
      const shown = await views();
      await migrateLessonVersions(pgDb.db);
      expect(await stored()).toEqual(settled);
      h.store.clear();
      expect(await views()).toEqual(shown);
      expect(shown.two).toEqual(before.two);

      // --- An unused lesson goes, with its snapshots and their rows.
      await upsertLessonMaterial(3, { ...material, text: 'c is about fuel' });
      const linked = await linkLesson({
        moduleId: 2,
        lessonId: 3,
        prevLessonId: 1,
        nextLessonId: null,
      });
      if (!linked || typeof linked === 'string') throw new Error(`${linked}`);
      await indexLessonVersions(linked.createdVersionIds);
      expect(await ensureLessonChunks(3, 'c', 3)).toMatchObject({
        kind: 'ready',
        lessonVersionId: linked.createdVersionIds[0],
      });
      const ofC = `select
        (select count(*)::int from lesson_versions where lesson_id = 3) as snapshots,
        (select count(*)::int from docs where lesson_version_id = ${linked.createdVersionIds[0]}) as docs,
        (select count(*)::int from lesson_knowledge_chunks where lesson_id = 3) as chunks`;
      expect(await rows(ofC)).toEqual([{ snapshots: 1, docs: 1, chunks: 1 }]);
      expect(await unlinkLesson(2, 3)).toBe(true);
      // Out of the course, its snapshot stays until the lesson itself goes.
      expect(await rows(ofC)).toEqual([{ snapshots: 1, docs: 1, chunks: 1 }]);
      expect(await errorOf(updateLessonName(3, 'C again'))).toBe(
        'v1.0 was used by a course. Enter a higher version to make changes.',
      );
      expect(await deleteLesson(3)).toEqual({ ok: true });
      expect(await rows(ofC)).toEqual([{ snapshots: 0, docs: 0, chunks: 0 }]);
      // Every other row is untouched (lesson 3 was `settled`'s last lesson).
      const [lessons, ...rest] = await stored();
      const [settledLessons, ...settledRest] = settled;
      expect(lessons).toEqual(settledLessons.filter((l) => l.id !== 3));
      expect(rest).toEqual(settledRest);
      expect(await views()).toEqual(shown);
    });
  },
);
