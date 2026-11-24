// @vitest-environment node
import pg from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { LessonMaterialGeneration } from '#/types';
import { type FreshDb, freshDb } from './support/local-pg';

const h = vi.hoisted(() => ({
  db: null as unknown,
  invalidateCourseDetailsCache: vi.fn(async (_slug: string | null) => {}),
  invalidatePlayback: vi.fn(async (_slug: string) => {}),
}));
vi.mock('#/db', () => ({
  get db() {
    return h.db;
  },
}));
// Everything the writers reach outside Postgres: caches, blobs, video APIs.
vi.mock('#/db/course-cache', () => ({
  invalidateCourseDetailsCache: h.invalidateCourseDetailsCache,
}));
vi.mock('#/db/lesson-playback', () => ({
  getLessonPlayback: Object.assign(vi.fn(), {
    invalidate: h.invalidatePlayback,
  }),
}));
// A floor under the mocks above: nothing in this file may reach a real Redis.
const redisCalls = vi.hoisted(() => [] as PropertyKey[]);
vi.mock('#/integrations/upstash/redis', () => ({
  redis: new Proxy(
    {},
    {
      get: (_target, command) => async () => {
        redisCalls.push(command);
        return null;
      },
    },
  ),
}));
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: vi.fn(),
}));
vi.mock('#/lib/video-providers/resolve.server', () => ({
  resolvePlayback: vi.fn(),
  validateCredentials: vi.fn(),
}));
vi.mock('#/db/video-captions', () => ({ muxCaptionsForPlayback: vi.fn() }));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));

const { setLessonVersion, VersionEditError } = await import(
  '../lesson-content-edit'
);
const { upsertLessonMaterial } = await import('../lesson');
const {
  removeLessonAlternateVideo,
  setLessonAlternateVideo,
  setLessonVideo,
  updateLessonConfig,
  updateLessonName,
} = await import('../admin');
const { createLibraryLesson } = await import('../library-lessons');
const { placeLessonInLibrary } = await import('../discipline-modules');
const { updateCourseLessonVersion } = await import('../lesson-versions');
const { linkLesson, unlinkLesson } = await import('../placements');

/**
 * Three courses with a module each. Lesson 1 has a video, a French one and
 * material. It is placed nowhere, so its 1.0 is untaken. Dates are fixed so
 * that any touch shows. Deletes, not a truncate: that would rewrite every
 * table of the schema before every test.
 */
const SEED = `
  delete from courses; delete from lessons; delete from discipline_modules;
  delete from disciplines; delete from organizations;
  insert into organizations (id, name) overriding system value values (1, 'Org');
  insert into disciplines (id, org_id, name, slug) overriding system value values
    (1, 1, 'UAS', 'uas'), (2, 1, '3D Airmanship', '3d-airmanship');
  insert into discipline_modules (id, discipline_id, name, rank)
    overriding system value values (1, 1, 'Basics', 1);
  insert into courses (id, name, slug) overriding system value values
    (1, 'One', 'one'), (2, 'Two', 'two'), (3, 'Three', 'three');
  insert into course_orgs (course_id, org_id) values (1, 1), (2, 1), (3, 1);
  insert into modules (id, course_id, name, slug, required_subscriptions)
    overriding system value values
    (1, 1, 'M1', 'm1', '{}'), (2, 2, 'M2', 'm2', '{}'), (3, 3, 'M3', 'm3', '{}');
  insert into course_modules (course_id, module_id, rank) values (1, 1, 1), (2, 2, 1), (3, 3, 1);
  insert into lessons (id, name, slug, required_subscriptions, org_id, discipline_id,
      video_provider, video_ref, other_video_ids, content_updated_at, updated_at)
    overriding system value values
    (1, 'A', 'a', '{}', 1, 1, 'mux', 'ref-a',
      '[{"lang":"fr","provider":"mux","ref":"fr-a"}]', '2020-01-01', '2020-01-01');
  insert into lesson_material (lesson_slug, text, test_this) values
    ('a', 'old text', '[{"name":"t","url":"u"}]');
`;

const material: LessonMaterialGeneration = {
  text: 'new text',
  keyPoints: ['k'],
  proTips: 'tips',
  quiz: [],
};

/** NUL, which Postgres stores in neither text nor jsonb. */
const UNSTORABLE = 'x\u0000';

/** Every route to a lesson's content, what it stores, and a write that fails. */
const WRITERS: {
  what: string;
  write: (version?: string) => Promise<unknown>;
  stored: Record<string, unknown>;
  fail?: (version: string) => Promise<unknown>;
}[] = [
  {
    what: 'material',
    write: (version) => upsertLessonMaterial(1, material, version),
    stored: { text: 'new text' },
    fail: (version) =>
      upsertLessonMaterial(1, { ...material, text: UNSTORABLE }, version),
  },
  {
    what: 'video',
    write: (version) => setLessonVideo(1, 'synthesia', 'new-ref', version),
    stored: { video_provider: 'synthesia', video_ref: 'new-ref' },
    fail: (version) => setLessonVideo(1, 'mux', UNSTORABLE, version),
  },
  {
    what: 'add language',
    write: (version) =>
      setLessonAlternateVideo(
        1,
        { lang: 'hi', provider: 'mux', ref: 'hi-a' },
        version,
      ),
    stored: {
      other_video_ids: [
        { lang: 'fr', provider: 'mux', ref: 'fr-a' },
        { lang: 'hi', provider: 'mux', ref: 'hi-a' },
      ],
    },
    fail: (version) =>
      setLessonAlternateVideo(
        1,
        { lang: 'hi', provider: 'mux', ref: UNSTORABLE },
        version,
      ),
  },
  {
    what: 'remove language',
    write: (version) => removeLessonAlternateVideo(1, 'fr', version),
    stored: { other_video_ids: [] },
  },
  {
    what: 'rename',
    write: (version) => updateLessonName(1, 'New name', version),
    stored: { name: 'New name' },
    fail: (version) => updateLessonName(1, UNSTORABLE, version),
  },
];

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'the content edit gate on Postgres',
  () => {
    let pgDb: FreshDb;
    const rows = async (q: string) => (await pgDb.pool.query(q)).rows;
    /** The whole working copy, every column. */
    const workingCopy = async () => ({
      lesson: await rows('select * from lessons where id = 1'),
      material: await rows('select * from lesson_material order by id'),
    });
    const lesson = async () =>
      (
        await rows(`select l.*, m.text from lessons l
          left join lesson_material m on m.lesson_slug = l.slug where l.id = 1`)
      )[0];
    const contentEdited = async () =>
      (await lesson()).content_updated_at.getFullYear() > 2020;
    /** Place lesson 1 in a course (module n is course n's): it takes the version. */
    const take = (courseId: number) =>
      linkLesson({
        moduleId: courseId,
        lessonId: 1,
        prevLessonId: null,
        nextLessonId: null,
      });
    const refusal = async (write: Promise<unknown>) => {
      const error = await write.then(
        () => 'was accepted',
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(VersionEditError);
      return (error as InstanceType<typeof VersionEditError>).body;
    };

    /** Another session mid-transaction, for the interleavings below. */
    let other: pg.Client | undefined;
    async function holdLesson() {
      other = new pg.Client({ ...pgDb.pool.options });
      await other.connect();
      await other.query('begin');
      await other.query('select 1 from lessons where id = 1 for update');
      return other;
    }
    async function untilBlocked(n: number) {
      for (let i = 0; i < 200; i++) {
        const [{ blocked }] = await rows(`select count(*)::int as blocked
          from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`);
        if (blocked >= n) return;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`never saw ${n} sessions waiting for a lock`);
    }

    beforeAll(async () => {
      pgDb = await freshDb({ migrated: true });
      h.db = pgDb.db;
      // Clear of the seed's own ids.
      await pgDb.pool.query('alter table lessons alter id restart with 100');
    });
    afterAll(() => pgDb?.drop());
    beforeEach(async () => {
      await pgDb.pool.query(SEED);
      vi.clearAllMocks();
    });
    afterEach(async () => {
      await other?.end();
      other = undefined;
      expect(redisCalls.splice(0)).toEqual([]);
    });

    describe.each(WRITERS)('$what', ({ write, stored, fail }) => {
      it('refused on a taken version and nothing is written', async () => {
        await take(1);
        const before = await workingCopy();
        expect(await refusal(write())).toEqual({
          error:
            'v1.0 is used by 1 course. Enter a higher version to make changes.',
          code: 'version',
          version: '1.0',
          highestTaken: '1.0',
        });
        // Repeating the locked version is no bump either.
        expect((await refusal(write('1.0'))).error).toMatch(/^v1\.0 is used/);
        expect(await workingCopy()).toEqual(before);
      });

      it('refused with a version that is not higher, and nothing is written', async () => {
        await take(1);
        const before = await workingCopy();
        expect(await refusal(write('0.9'))).toEqual({
          error: 'Enter a version higher than v1.0.',
          code: 'version',
          version: '1.0',
          highestTaken: '1.0',
        });
        expect(await workingCopy()).toEqual(before);
      });

      it('accepted with a higher version, which is stored', async () => {
        await take(1);
        const before = await lesson();
        await write('1.1');
        expect(await lesson()).toMatchObject({ ...stored, version: '1.1' });
        expect(await contentEdited()).toBe(true);
        // Only what it edits: the rest of the working copy stands.
        const {
          version: _v,
          content_updated_at: _c,
          updated_at: _u,
          ...rest
        } = { ...before, ...stored };
        expect(await lesson()).toMatchObject(rest);
        // The course keeps what it took.
        expect(
          await rows(
            'select version, name, video_ref, text from lesson_versions',
          ),
        ).toEqual([
          { version: '1.0', name: 'A', video_ref: 'ref-a', text: 'old text' },
        ]);
      });

      it('free on an untaken version', async () => {
        await write();
        expect(await lesson()).toMatchObject({ ...stored, version: '1.0' });
        expect(await contentEdited()).toBe(true);
      });

      it('free again once the version has been moved past the taken one', async () => {
        await take(1);
        await setLessonVersion(1, '1.1');
        await write();
        expect(await lesson()).toMatchObject({ ...stored, version: '1.1' });
      });

      it.runIf(fail)(
        'a write that fails does not move the version',
        async () => {
          await take(1);
          const before = await workingCopy();
          const error = await fail?.('1.1').catch((e: unknown) => e);
          expect(error).toBeInstanceOf(Error);
          expect(error).not.toBeInstanceOf(VersionEditError);
          expect(await workingCopy()).toEqual(before);
        },
      );

      it('leaves the learner caches alone: courses show their snapshot', async () => {
        await take(1);
        vi.clearAllMocks();
        await write('1.1');
        expect(h.invalidateCourseDetailsCache).not.toHaveBeenCalled();
        expect(h.invalidatePlayback).not.toHaveBeenCalled();
      });

      it('a course taking 1.1 between two saves makes the second save refused', async () => {
        await take(1);
        await write('1.1');
        await updateCourseLessonVersion({
          courseId: 1,
          lessonId: 1,
          toVersion: '1.1',
        });
        const before = await workingCopy();
        // The editor still holds 1.1 as the version it is working on.
        expect(await refusal(write('1.1'))).toEqual({
          error:
            'v1.1 is used by 1 course. Enter a higher version to make changes.',
          code: 'version',
          version: '1.1',
          highestTaken: '1.1',
        });
        expect((await refusal(write())).version).toBe('1.1');
        expect(await workingCopy()).toEqual(before);
      });

      it('waits for a course taking the version, then is refused', async () => {
        const session = await holdLesson();
        const refused = refusal(write());
        refused.catch(() => {});
        await untilBlocked(1);
        await session.query(`insert into lesson_versions
          (lesson_id, version, name, extra_tab) values (1, '1.0', 'A', 'testThis')`);
        const before = await workingCopy();
        await session.query('commit');
        expect((await refused).highestTaken).toBe('1.0');
        expect(await workingCopy()).toEqual(before);
      });

      it('waits for a version bump in progress, then edits the bumped copy', async () => {
        await take(1);
        const session = await holdLesson();
        const written = write();
        written.catch(() => {});
        await untilBlocked(1);
        await session.query(`update lessons set version = '1.1' where id = 1`);
        await session.query('commit');
        await written;
        expect(await lesson()).toMatchObject({ ...stored, version: '1.1' });
      });
    });

    it('a lesson that does not exist is null, not refused', async () => {
      expect(await upsertLessonMaterial(99, material, '1.1')).toBeNull();
      expect(await setLessonVideo(99, 'mux', 'r', '1.1')).toBeNull();
      expect(await removeLessonAlternateVideo(99, 'fr', '1.1')).toBeNull();
      expect(await updateLessonName(99, 'N', '1.1')).toBeNull();
      expect(await setLessonVersion(99, '1.1')).toBeNull();
    });

    describe('the locked message', () => {
      it('counts only courses showing the lesson on exactly that version', async () => {
        await take(1);
        await take(2);
        expect((await refusal(updateLessonName(1, 'N'))).error).toBe(
          'v1.0 is used by 2 courses. Enter a higher version to make changes.',
        );
        await setLessonVersion(1, '1.1');
        await take(3);
        // Three courses use the lesson; one is on 1.1.
        expect((await refusal(updateLessonName(1, 'N'))).error).toBe(
          'v1.1 is used by 1 course. Enter a higher version to make changes.',
        );
      });

      it('a version no course uses any more stays locked and says so', async () => {
        await take(1);
        await unlinkLesson(1, 1);
        expect((await refusal(updateLessonName(1, 'N'))).error).toBe(
          'v1.0 was used by a course. Enter a higher version to make changes.',
        );
      });

      it('compares versions as numbers', async () => {
        await setLessonVersion(1, '1.9');
        await take(1);
        await updateLessonName(1, 'N', '1.10');
        await take(2);
        expect(await refusal(updateLessonName(1, 'N2', '1.9'))).toMatchObject({
          error: 'Enter a version higher than v1.10.',
          highestTaken: '1.10',
        });
      });
    });

    describe('setLessonVersion', () => {
      it('moves the version, and counts as a content edit', async () => {
        await take(1);
        expect(await setLessonVersion(1, '1.1')).toEqual({
          id: 1,
          version: '1.1',
        });
        expect(await lesson()).toMatchObject({ version: '1.1', name: 'A' });
        expect(await contentEdited()).toBe(true);
      });

      it('the version it already has changes nothing', async () => {
        const before = await workingCopy();
        expect(await setLessonVersion(1, '1.0')).toEqual({
          id: 1,
          version: '1.0',
        });
        expect(await workingCopy()).toEqual(before);
      });

      it('may go down while untaken', async () => {
        await setLessonVersion(1, '0.5');
        expect(await lesson()).toMatchObject({ version: '0.5' });
      });

      it('refused when locked or not higher, and nothing is written', async () => {
        await take(1);
        const before = await workingCopy();
        expect((await refusal(setLessonVersion(1, '1.0'))).error).toBe(
          'v1.0 is used by 1 course. Enter a higher version to make changes.',
        );
        expect((await refusal(setLessonVersion(1, '0.9'))).error).toBe(
          'Enter a version higher than v1.0.',
        );
        expect(await workingCopy()).toEqual(before);
      });
    });

    it('settings (visibility, levels, paid, debrief) save on a taken version and do not touch content_updated_at', async () => {
      await take(1);
      vi.clearAllMocks();
      await updateLessonConfig(1, {
        isAvailable: true,
        levels: ['basic'],
        requiredSubscriptions: ['associate'],
        hasDebrief: false,
        needsVideoWatch: false,
      });
      expect(await lesson()).toMatchObject({
        is_available: true,
        levels: ['basic'],
        required_subscriptions: ['associate'],
        has_debrief: false,
        needs_video_watch: false,
        version: '1.0',
      });
      expect(await contentEdited()).toBe(false);
      // Settings are live in every course, so its cached payload goes.
      expect(h.invalidateCourseDetailsCache.mock.calls).toEqual([['one']]);
    });

    it('filing a lesson in a module is not a content edit', async () => {
      await take(1);
      expect(
        await placeLessonInLibrary({
          lessonId: 1,
          disciplineId: 1,
          disciplineModuleId: 1,
          prevLessonId: null,
          nextLessonId: null,
        }),
      ).toMatchObject({ ok: true });
      expect(await contentEdited()).toBe(false);
    });

    it('a new lesson starts at 1.0', async () => {
      await createLibraryLesson({ orgId: 1, disciplineId: 1, name: 'Filed' });
      expect(
        await rows(
          'select name, version from lessons where id > 1 order by id',
        ),
      ).toEqual([{ name: 'Filed', version: '1.0' }]);
    });

    it('text saved after the lesson changes discipline keeps the tab it now shows', async () => {
      const session = await holdLesson();
      const saved = upsertLessonMaterial(1, {
        ...material,
        jobOfTheDay: 'https://job',
        testThis: [{ name: 't', url: 'u' }],
      });
      saved.catch(() => {});
      await untilBlocked(1);
      await session.query('update lessons set discipline_id = 2 where id = 1');
      await session.query('commit');
      expect(await saved).toMatchObject({
        jobOfTheDay: 'https://job',
        testThis: null,
      });
    });
  },
);
