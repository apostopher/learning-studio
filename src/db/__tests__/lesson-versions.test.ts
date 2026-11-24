// @vitest-environment node
import { drizzle } from 'drizzle-orm/node-postgres';
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
import type { Tx } from '../lesson-versions';
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
vi.mock('#/db/lesson-transcript', () => ({ getLessonTranscript: vi.fn() }));
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: vi.fn(),
}));
vi.mock('#/lib/video-providers/resolve.server', () => ({
  resolvePlayback: vi.fn(),
  validateCredentials: vi.fn(),
}));
vi.mock('#/db/video-captions', () => ({ muxCaptionsForPlayback: vi.fn() }));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));

const {
  countCoursesOnVersion,
  getCourseIdsShowingModule,
  getCoursesUsingLesson,
  highestTakenVersions,
  syncCourseLessonVersions,
  updateCourseLessonVersion,
} = await import('../lesson-versions');
const { linkLesson, movePlacement, unlinkLesson } = await import(
  '../placements'
);
const { copyDisciplineModuleIntoCourse } = await import(
  '../copy-discipline-module'
);
const { remixCourse, unremixCourse } = await import('../course-remixes');
const { createCourse, createLesson, createModule, deleteModule } = await import(
  '../admin'
);

/**
 * Course 1 owns modules 1 and 2; course 2 remixes it and owns module 3;
 * course 3 owns module 4. Lesson 1 (A) has everything, lesson 2 (B) has
 * neither material nor video, lesson 3 (C) is a second full one. Nothing is
 * placed: each test places what it needs through the writers.
 */
const SEED = `
  truncate organizations, courses, lessons, disciplines, modules restart identity cascade;
  insert into organizations (name) values ('Org');
  insert into disciplines (org_id, name, slug)
    values (1, '3D Airmanship', '3d-airmanship'), (1, 'UAS', 'uas');
  insert into discipline_modules (discipline_id, name, rank) values (2, 'Basics', 1);
  insert into courses (name, slug) values ('One', 'one'), ('Two', 'two'), ('Three', 'three');
  insert into course_orgs (course_id, org_id) values (1, 1), (2, 1), (3, 1);
  insert into modules (course_id, name, slug, required_subscriptions) values
    (1, 'M1', 'm1', '{}'), (1, 'M2', 'm2', '{}'), (2, 'M3', 'm3', '{}'), (3, 'M4', 'm4', '{}');
  insert into course_modules (course_id, module_id, rank) values
    (1, 1, 1), (1, 2, 2), (2, 1, 1), (2, 2, 2), (2, 3, 3), (3, 4, 1);
  insert into course_remixes (course_id, source_course_id) values (2, 1);
  insert into lessons (name, slug, required_subscriptions, org_id, discipline_id,
      discipline_module_id, video_provider, video_ref, other_video_ids) values
    ('A', 'a', '{}', 1, 1, null, 'mux', 'ref-a', '[{"language":"hi"}]'),
    ('B', 'b', '{}', 1, 2, 1, null, null, '[]'),
    ('C', 'c', '{}', 1, 2, 1, 'mux', 'ref-c', '[]');
  insert into lesson_material (lesson_slug, text, key_points, quiz, pro_tips,
      links, assignments, job_of_the_day, test_this) values
    ('a', 'first', '["k1"]', '[{"q":1}]', 'tips', '[{"url":"u"}]', 'asg',
      'https://job', '[{"url":"t"}]'),
    ('a', 'second', null, null, null, null, null, null, null),
    ('c', 'c text', null, null, null, null, null, null, null);
`;

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'lesson versions on Postgres',
  () => {
    let pgDb: FreshDb;
    const rows = async (q: string) => (await pgDb.pool.query(q)).rows;
    const snapshots = () =>
      rows('select lesson_id, version, name from lesson_versions order by id');
    const pins = async () =>
      (
        await rows(`select p.course_id, p.lesson_id, v.version
          from course_lesson_versions p
          join lesson_versions v
            on v.id = p.lesson_version_id and v.lesson_id = p.lesson_id
          order by 1, 2`)
      ).map((p) => `course ${p.course_id}: lesson ${p.lesson_id} ${p.version}`);
    /** Every lesson a course shows, with no pin. Must be none, always. */
    const unpinned = () =>
      rows(`select cm.course_id, ml.lesson_id from course_modules cm
        join module_lessons ml on ml.module_id = cm.module_id
        left join course_lesson_versions p
          on p.course_id = cm.course_id and p.lesson_id = ml.lesson_id
        where p.lesson_id is null`);
    const link = (moduleId: number, lessonId: number) =>
      linkLesson({
        moduleId,
        lessonId,
        prevLessonId: null,
        nextLessonId: null,
      });
    /** Move the working copy on, the way an author does. */
    const bump = (lessonId: number, version: string, name = `v${version}`) =>
      pgDb.pool.query(
        `update lessons set version = $2, name = $3 where id = $1`,
        [lessonId, version, name],
      );
    const remix = (courseId: number, sourceCourseId: number) =>
      remixCourse({ orgId: 1, courseId, sourceCourseId, actorId: null });
    const versionIds = async () =>
      (await rows('select id from lesson_versions order by id')).map(
        (r) => r.id,
      );

    /** Another session mid-transaction, for the interleavings below. */
    let other: pg.Client;
    async function otherSession() {
      other = new pg.Client({ ...pgDb.pool.options });
      await other.connect();
      await other.query('begin');
    }
    const commitOther = () => other.query('commit');
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
    });
    afterAll(() => pgDb?.drop());
    beforeEach(async () => {
      vi.clearAllMocks();
      await pgDb.pool.query(SEED);
    });

    it('linking a lesson pins the working copy for the owner and every borrower', async () => {
      const result = await link(1, 1);
      expect(result).toMatchObject({
        moduleId: 1,
        lessonId: 1,
        createdVersionIds: await versionIds(),
      });
      expect(await pins()).toEqual([
        'course 1: lesson 1 1.0',
        'course 2: lesson 1 1.0',
      ]);
      expect(
        await rows(`select version, name, video_provider, video_ref, other_video_ids,
          text, key_points, quiz, pro_tips, links, assignments, job_of_the_day,
          test_this, extra_tab from lesson_versions`),
      ).toEqual([
        {
          version: '1.0',
          name: 'A',
          video_provider: 'mux',
          video_ref: 'ref-a',
          other_video_ids: [{ language: 'hi' }],
          text: 'first',
          key_points: ['k1'],
          quiz: [{ q: 1 }],
          pro_tips: 'tips',
          links: [{ url: 'u' }],
          assignments: 'asg',
          job_of_the_day: 'https://job',
          test_this: [{ url: 't' }],
          extra_tab: 'jobOfTheDay',
        },
      ]);
    });

    it('a second course shares the existing snapshot of the same version', async () => {
      await link(3, 1);
      const second = await link(4, 1);
      expect(second).toMatchObject({ createdVersionIds: [] });
      expect(await snapshots()).toHaveLength(1);
      expect(await pins()).toEqual([
        'course 2: lesson 1 1.0',
        'course 3: lesson 1 1.0',
      ]);
    });

    it('editing the working copy changes neither the snapshot nor the pin', async () => {
      await link(1, 1);
      const before = await rows('select * from lesson_versions');
      await pgDb.pool.query(`
        update lessons set name = 'A2', video_ref = 'ref-2' where id = 1;
        update lesson_material set text = 'edited' where lesson_slug = 'a';
        update lessons set version = '1.1' where id = 1;
      `);
      // Another write that syncs both courses must not move them either.
      await link(1, 3);
      expect(
        await rows('select * from lesson_versions where lesson_id = 1'),
      ).toEqual(before);
      expect((await pins()).filter((p) => p.includes('lesson 1'))).toEqual([
        'course 1: lesson 1 1.0',
        'course 2: lesson 1 1.0',
      ]);
    });

    it('a lesson with no material or video snapshots as null, and stays null after the working copy gains them', async () => {
      const emptiness = () =>
        rows(`select video_provider, video_ref, text, key_points, quiz, extra_tab
          from lesson_versions where lesson_id = 2`);
      const empty = [
        {
          video_provider: null,
          video_ref: null,
          text: null,
          key_points: null,
          quiz: null,
          extra_tab: 'testThis',
        },
      ];
      await link(1, 2);
      expect(await emptiness()).toEqual(empty);
      await pgDb.pool.query(`
        update lessons set video_provider = 'mux', video_ref = 'new' where id = 2;
        insert into lesson_material (lesson_slug, text) values ('b', 'new text');
      `);
      await link(4, 2);
      expect(await emptiness()).toEqual(empty);
    });

    it('unlinking drops the pin; re-linking takes the CURRENT version', async () => {
      await link(1, 1);
      expect(await unlinkLesson(1, 1)).toBe(true);
      expect(await pins()).toEqual([]);
      await bump(1, '1.1');
      await link(1, 1);
      expect(await pins()).toEqual([
        'course 1: lesson 1 1.1',
        'course 2: lesson 1 1.1',
      ]);
    });

    it('unlinking from one of two modules keeps the pin', async () => {
      // Course 2 shows lesson 1 in its own module and in a borrowed one.
      await link(3, 1);
      await link(1, 1);
      await bump(1, '1.1');
      await unlinkLesson(1, 1);
      expect(await pins()).toEqual(['course 2: lesson 1 1.0']);
    });

    it('moving between modules of one course keeps the pin', async () => {
      await link(1, 1);
      await bump(1, '1.1');
      const moved = await movePlacement({
        lessonId: 1,
        fromModuleId: 1,
        targetModuleId: 2,
        prevLessonId: null,
        nextLessonId: null,
      });
      expect(moved).toMatchObject({ moduleId: 2 });
      expect(await pins()).toEqual([
        'course 1: lesson 1 1.0',
        'course 2: lesson 1 1.0',
      ]);
      expect(await snapshots()).toHaveLength(1);
    });

    it('a move into a module fewer courses show drops the pins it orphans', async () => {
      await pgDb.pool.query(
        'delete from course_modules where course_id = 2 and module_id = 2',
      );
      await link(1, 1);
      const move = (fromModuleId: number, targetModuleId: number) =>
        movePlacement({
          lessonId: 1,
          fromModuleId,
          targetModuleId,
          prevLessonId: null,
          nextLessonId: null,
        });
      await move(1, 2);
      expect(await pins()).toEqual(['course 1: lesson 1 1.0']);
      await move(2, 1);
      expect(await pins()).toEqual([
        'course 1: lesson 1 1.0',
        'course 2: lesson 1 1.0',
      ]);
    });

    it("remix pins the working copy's version even when the source course is pinned lower", async () => {
      await link(1, 1);
      await link(2, 3);
      await bump(1, '1.1');
      const result = await remix(3, 1);
      const created = await rows(
        `select id from lesson_versions where lesson_id = 1 and version = '1.1'`,
      );
      expect(result).toEqual({
        ok: true,
        moduleCount: 2,
        createdVersionIds: [created[0].id],
      });
      expect(await pins()).toEqual([
        'course 1: lesson 1 1.0',
        'course 1: lesson 3 1.0',
        'course 2: lesson 1 1.0',
        'course 2: lesson 3 1.0',
        'course 3: lesson 1 1.1',
        'course 3: lesson 3 1.0',
      ]);
    });

    it('a remix that only adds lessons the course already shows leaves its pins', async () => {
      await link(4, 1);
      await link(1, 1);
      await bump(1, '1.1');
      await remix(3, 1);
      expect(await pins()).toContain('course 3: lesson 1 1.0');
      expect(await snapshots()).toHaveLength(1);
    });

    it('unremix and deleteModule drop the pins they orphan', async () => {
      await link(1, 1);
      await link(3, 3); // course 2 also has C in its own module
      await link(2, 3);
      await unremixCourse({ orgId: 1, courseId: 2, sourceCourseId: 1 });
      expect(await pins()).toEqual([
        'course 1: lesson 1 1.0',
        'course 1: lesson 3 1.0',
        'course 2: lesson 3 1.0',
      ]);
      expect(await deleteModule(2)).toBe(true);
      expect(await pins()).toEqual([
        'course 1: lesson 1 1.0',
        'course 2: lesson 3 1.0',
      ]);
    });

    it('deleting a module drops the borrower’s pins too', async () => {
      await link(1, 1);
      await deleteModule(1);
      expect(await pins()).toEqual([]);
      expect(await snapshots()).toHaveLength(1); // a taken version stays taken
    });

    it('copying a library module pins its lessons and reports their snapshots', async () => {
      await link(4, 3);
      await bump(3, '1.1');
      const result = await copyDisciplineModuleIntoCourse({
        courseId: 1,
        disciplineModuleId: 1,
        afterModuleId: null,
      });
      expect(result?.placedLessonIds).toEqual([2, 3]);
      const created = await rows(
        `select id from lesson_versions where lesson_id = 2 or version = '1.1' order by id`,
      );
      expect([...(result?.createdVersionIds ?? [])].sort()).toEqual(
        created.map((r) => r.id),
      );
      expect(created).toHaveLength(2);
      // Course 2 remixes course 1, so it received the module as well.
      expect(await pins()).toEqual([
        'course 1: lesson 2 1.0',
        'course 1: lesson 3 1.1',
        'course 2: lesson 2 1.0',
        'course 2: lesson 3 1.1',
        'course 3: lesson 3 1.0',
      ]);
    });

    it('a new course takes the current version of every flagship lesson', async () => {
      await pgDb.pool.query(
        `update courses set slug = '3d-airmanship' where id = 1`,
      );
      await link(1, 1);
      await bump(1, '1.1');
      const created = await createCourse({ name: 'Fresh' } as never, 1);
      const [snapshot] = await rows(
        `select id from lesson_versions where version = '1.1'`,
      );
      expect(created.createdVersionIds).toEqual([snapshot.id]);
      expect(await pins()).toContain(`course ${created.id}: lesson 1 1.1`);
      expect(await unpinned()).toEqual([]);
    });

    it('a lesson created in a module is pinned in every course showing it', async () => {
      const { id } = await createLesson({ moduleId: 1, name: 'New' });
      expect(await pins()).toEqual([
        `course 1: lesson ${id} 1.0`,
        `course 2: lesson ${id} 1.0`,
      ]);
    });

    it('a new module, shown to remixers too, changes no pin', async () => {
      await link(1, 1);
      const before = await pins();
      await createModule({ courseId: 1, name: 'M5' });
      expect(await pins()).toEqual(before);
      expect(await unpinned()).toEqual([]);
    });

    describe('updateCourseLessonVersion', () => {
      it('updateCourseLessonVersion moves one course only', async () => {
        await link(1, 1);
        await bump(1, '1.1', 'A new');
        // What the next reader would find when each cache is evicted.
        const seenAtEviction: unknown[] = [];
        vi.clearAllMocks();
        h.invalidateCourseDetailsCache.mockImplementationOnce(async (slug) => {
          seenAtEviction.push(slug, await pins());
        });
        const result = await updateCourseLessonVersion({
          courseId: 2,
          lessonId: 1,
          toVersion: '1.1',
        });
        const [snapshot] = await rows(
          `select id, name from lesson_versions where version = '1.1'`,
        );
        expect(snapshot.name).toBe('A new');
        expect(result).toEqual({
          ok: true,
          version: '1.1',
          createdVersionIds: [snapshot.id],
        });
        const after = ['course 1: lesson 1 1.0', 'course 2: lesson 1 1.1'];
        expect(await pins()).toEqual(after);
        expect(seenAtEviction).toEqual(['two', after]);
        expect(h.invalidateCourseDetailsCache).toHaveBeenCalledTimes(1);
        expect(h.invalidatePlayback).toHaveBeenCalledWith('a');

        // The owner follows later, on the snapshot that already exists.
        expect(
          await updateCourseLessonVersion({
            courseId: 1,
            lessonId: 1,
            toVersion: '1.1',
          }),
        ).toEqual({ ok: true, version: '1.1', createdVersionIds: [] });
      });

      it('updateCourseLessonVersion: stale / current / not-found', async () => {
        await link(1, 1);
        const before = await pins();
        const update = (
          courseId: number,
          lessonId: number,
          toVersion: string,
        ) => updateCourseLessonVersion({ courseId, lessonId, toVersion });

        expect(await update(1, 1, '1.0')).toEqual({
          ok: false,
          reason: 'current',
        });
        await bump(1, '1.2');
        expect(await update(1, 1, '1.1')).toEqual({
          ok: false,
          reason: 'stale',
        });
        const notFound = { ok: false, reason: 'not-found' };
        expect(await update(1, 99, '1.0')).toEqual(notFound);
        expect(await update(99, 1, '1.2')).toEqual(notFound);
        expect(await update(3, 1, '1.2')).toEqual(notFound); // not shown there

        expect(await pins()).toEqual(before);
        expect(await snapshots()).toHaveLength(1);
        expect(h.invalidatePlayback).not.toHaveBeenCalled();
      });

      it('survives a cache that is down', async () => {
        vi.spyOn(console, 'error').mockImplementationOnce(() => {});
        await link(1, 1);
        await bump(1, '1.1');
        h.invalidatePlayback.mockRejectedValueOnce(new Error('redis down'));
        expect(
          await updateCourseLessonVersion({
            courseId: 1,
            lessonId: 1,
            toVersion: '1.1',
          }),
        ).toMatchObject({ ok: true });
      });
    });

    /** Left behind by the old code, which unlinks without knowing of pins. */
    describe('stale pins', () => {
      beforeEach(async () => {
        await link(1, 1);
        await pgDb.pool.query('delete from module_lessons where lesson_id = 1');
        await bump(1, '1.1');
        expect(await pins()).toHaveLength(2);
      });

      it.each([
        ['linking', () => link(1, 1)],
        [
          'creating a lesson beside it, then linking',
          async () => {
            await createLesson({ moduleId: 1, name: 'New' });
            await link(1, 1);
          },
        ],
      ])('%s takes the CURRENT version', async (_how, add) => {
        await add();
        expect((await pins()).filter((p) => p.includes('lesson 1 '))).toEqual([
          'course 1: lesson 1 1.1',
          'course 2: lesson 1 1.1',
        ]);
      });

      it('copying a module takes the CURRENT version', async () => {
        await pgDb.pool.query(
          'update lessons set discipline_module_id = 1 where id = 1',
        );
        await copyDisciplineModuleIntoCourse({
          courseId: 1,
          disciplineModuleId: 1,
          afterModuleId: null,
          onlyLessonId: 1,
        });
        expect(await pins()).toEqual([
          'course 1: lesson 1 1.1',
          'course 2: lesson 1 1.1',
        ]);
      });

      it('remixing takes the CURRENT version', async () => {
        // Course 2's pin is the stale one; course 1 shows the lesson again.
        await link(1, 1);
        await pgDb.pool.query(`
          delete from course_remixes; delete from course_modules where course_id = 2;
          update course_lesson_versions set lesson_version_id =
            (select id from lesson_versions where version = '1.0') where course_id = 2`);
        await remix(2, 1);
        expect(await pins()).toContain('course 2: lesson 1 1.1');
      });

      it('are not counted, listed or updatable', async () => {
        expect(await countCoursesOnVersion(1, '1.0')).toBe(0);
        expect(await getCoursesUsingLesson(1)).toEqual([]);
        expect(
          await updateCourseLessonVersion({
            courseId: 1,
            lessonId: 1,
            toVersion: '1.1',
          }),
        ).toEqual({ ok: false, reason: 'not-found' });
      });

      it('go at the next write to the course', async () => {
        await link(1, 2);
        expect(await pins()).toEqual([
          'course 1: lesson 2 1.0',
          'course 2: lesson 2 1.0',
        ]);
      });
    });

    it('syncCourseLessonVersions pins what is missing and nothing else', async () => {
      await pgDb.pool.query(
        'insert into module_lessons (module_id, lesson_id, rank) values (1, 1, 1), (4, 3, 1)',
      );
      const { createdVersionIds } = await pgDb.db.transaction((tx) =>
        syncCourseLessonVersions(tx, [1]),
      );
      expect(createdVersionIds).toEqual(await versionIds());
      expect(await pins()).toEqual(['course 1: lesson 1 1.0']);
      expect(
        await pgDb.db.transaction((tx) => syncCourseLessonVersions(tx, [])),
      ).toEqual({ createdVersionIds: [] });
    });

    it('a write to a course with a missing pin repairs it', async () => {
      await pgDb.pool.query(
        'insert into module_lessons (module_id, lesson_id, rank) values (1, 3, 1)',
      );
      await link(1, 2);
      expect(await unpinned()).toEqual([]);
    });

    it('a failed write leaves pins and snapshots as they were', async () => {
      await link(1, 1);
      const before = await pins();
      // No org owns the course, so createLesson refuses inside its transaction.
      await pgDb.pool.query('delete from course_orgs where course_id = 1');
      await expect(createLesson({ moduleId: 1, name: 'X' })).rejects.toThrow();
      expect(await pins()).toEqual(before);
      expect(await link(1, 3)).toBe('foreign-lesson');
      expect(await snapshots()).toHaveLength(1);
    });

    describe('reads', () => {
      beforeEach(async () => {
        await link(3, 1); // course 2
        await link(1, 1); // courses 1 and 2
      });

      it('highestTakenVersions compares numerically and omits untaken lessons', async () => {
        expect(await highestTakenVersions([])).toEqual(new Map());
        await pgDb.pool.query(`insert into lesson_versions
          (lesson_id, version, name, extra_tab) values
          (1, '1.10', 'x', 'testThis'), (1, '1.9', 'x', 'testThis')`);
        expect(await highestTakenVersions([1, 2])).toEqual(
          new Map([[1, '1.10']]),
        );
      });

      it('getCoursesUsingLesson names each course once, borrowers included', async () => {
        expect(await getCoursesUsingLesson(1)).toEqual([
          { id: 1, name: 'One' },
          { id: 2, name: 'Two' },
        ]);
        expect(await getCoursesUsingLesson(2)).toEqual([]);
      });

      it('countCoursesOnVersion counts courses on exactly that version', async () => {
        expect(await countCoursesOnVersion(1, '1.0')).toBe(2);
        await bump(1, '1.1');
        await updateCourseLessonVersion({
          courseId: 2,
          lessonId: 1,
          toVersion: '1.1',
        });
        expect(await countCoursesOnVersion(1, '1.0')).toBe(1);
        expect(await countCoursesOnVersion(1, '1.1')).toBe(1);
        expect(await countCoursesOnVersion(1, '1')).toBe(0);
      });

      it('read through the executor they are given', async () => {
        const client = await pgDb.pool.connect();
        try {
          await client.query('begin');
          const tx = drizzle(client) as unknown as Tx;
          await client.query(`insert into lesson_versions
            (lesson_id, version, name, extra_tab) values (1, '2.0', 'x', 'testThis');
            delete from module_lessons where module_id = 1`);
          expect(await highestTakenVersions([1], tx)).toEqual(
            new Map([[1, '2.0']]),
          );
          expect(await getCoursesUsingLesson(1, tx)).toEqual([
            { id: 2, name: 'Two' },
          ]);
          expect(await countCoursesOnVersion(1, '1.0', tx)).toBe(1);
        } finally {
          await client.query('rollback');
          client.release();
        }
      });

      it('getCourseIdsShowingModule lists the owner and its borrowers', async () => {
        await pgDb.db.transaction(async (tx) => {
          expect(await getCourseIdsShowingModule(tx, 1)).toEqual([1, 2]);
          expect(await getCourseIdsShowingModule(tx, 4)).toEqual([3]);
        });
      });
    });

    describe('concurrency', () => {
      beforeEach(otherSession);
      // Also ends the transaction when a test failed half way.
      afterEach(() => other.end());

      it('two courses adding the same lesson at once both succeed', async () => {
        await other.query('select 1 from lessons where id = 1 for update');
        const both = Promise.all([link(1, 1), link(4, 1)]);
        both.catch(() => {});
        await untilBlocked(2);
        await commitOther();
        expect(await both).toMatchObject([{ moduleId: 1 }, { moduleId: 4 }]);
        expect(await snapshots()).toHaveLength(1);
        expect(await pins()).toEqual([
          'course 1: lesson 1 1.0',
          'course 2: lesson 1 1.0',
          'course 3: lesson 1 1.0',
        ]);
      });

      it('courses that remix each other can both be written at once', async () => {
        await remix(1, 2);
        await other.query('select 1 from courses for update');
        const both = Promise.all([
          link(1, 1),
          link(3, 3),
          createModule({ courseId: 1, name: 'X' }),
          createModule({ courseId: 2, name: 'Y' }),
        ]);
        both.catch(() => {});
        await untilBlocked(4);
        await commitOther();
        await both;
        expect(await pins()).toEqual([
          'course 1: lesson 1 1.0',
          'course 1: lesson 3 1.0',
          'course 2: lesson 1 1.0',
          'course 2: lesson 3 1.0',
        ]);
      });

      it('a snapshot waits for a content edit in progress and freezes its result', async () => {
        await other.query('select 1 from lessons where id = 1 for update');
        const linked = link(1, 1);
        linked.catch(() => {});
        await untilBlocked(1);
        await other.query(`update lessons set name = 'Edited' where id = 1`);
        await other.query(
          `update lesson_material set text = 'edited' where lesson_slug = 'a'`,
        );
        await commitOther();
        await linked;
        expect(await rows('select name, text from lesson_versions')).toEqual([
          { name: 'Edited', text: 'edited' },
        ]);
      });

      it('a course update waits for a content edit in progress, then finds it stale', async () => {
        await link(1, 1);
        await bump(1, '1.1');
        await other.query('select 1 from lessons where id = 1 for update');
        const updated = updateCourseLessonVersion({
          courseId: 1,
          lessonId: 1,
          toVersion: '1.1',
        });
        updated.catch(() => {});
        await untilBlocked(1);
        await other.query(`update lessons set version = '1.2' where id = 1`);
        await commitOther();
        expect(await updated).toEqual({ ok: false, reason: 'stale' });
        expect(await snapshots()).toHaveLength(1);
      });

      it('a lesson linked while its module is being remixed is pinned in the new borrower', async () => {
        // What remixCourse holds and has written, uncommitted.
        await other.query(
          'select 1 from courses where id = 1 for no key update',
        );
        await other.query(
          'insert into course_modules (course_id, module_id, rank) values (3, 1, 2)',
        );
        const linked = link(1, 1);
        linked.catch(() => {});
        await untilBlocked(1);
        await commitOther();
        await linked;
        expect(await unpinned()).toEqual([]);
        expect(await pins()).toContain('course 3: lesson 1 1.0');
      });

      it.each([
        ['unlinking', () => unlinkLesson(1, 1)],
        ['deleting the module', () => deleteModule(1)],
        [
          'un-remixing',
          () => unremixCourse({ orgId: 1, courseId: 2, sourceCourseId: 1 }),
        ],
        [
          'moving the lesson',
          () =>
            movePlacement({
              lessonId: 1,
              fromModuleId: 1,
              targetModuleId: 2,
              prevLessonId: null,
              nextLessonId: null,
            }),
        ],
        ['creating a lesson', () => createLesson({ moduleId: 1, name: 'N' })],
        ['deleting the remixed-from module', () => deleteModule(2)],
      ])('%s waits for a remix of the same course', async (_what, write) => {
        await link(1, 1);
        await other.query(
          'select 1 from courses where id = 1 for no key update',
        );
        await other.query(
          'insert into course_modules (course_id, module_id, rank) values (3, 1, 2)',
        );
        await other.query(`insert into course_lesson_versions
          select 3, 1, id from lesson_versions where lesson_id = 1`);
        const written = write();
        written.catch(() => {});
        await untilBlocked(1);
        await commitOther();
        await written;
        expect(await unpinned()).toEqual([]);
        // and nothing is pinned that no course shows
        expect(
          await rows(`select 1 from course_lesson_versions p where not exists (
            select 1 from course_modules cm join module_lessons ml
              on ml.module_id = cm.module_id
            where cm.course_id = p.course_id and ml.lesson_id = p.lesson_id)`),
        ).toEqual([]);
      });

      it('a borrower being deleted does not fail the link', async () => {
        await other.query('delete from courses where id = 2');
        const linked = link(1, 1);
        linked.catch(() => {});
        await untilBlocked(1);
        await commitOther();
        expect(await linked).toMatchObject({ moduleId: 1 });
        expect(await pins()).toEqual(['course 1: lesson 1 1.0']);
      });

      it('the same lesson dragged twice into one course lands once', async () => {
        await other.query('select 1 from courses where id = 1 for update');
        const both = Promise.all([link(1, 1), link(2, 1)]);
        both.catch(() => {});
        await untilBlocked(2);
        await commitOther();
        expect((await both).filter((r) => r === 'duplicate')).toHaveLength(1);
      });
    });
  },
);
