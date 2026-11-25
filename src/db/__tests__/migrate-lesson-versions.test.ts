// @vitest-environment node
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { PgDialect } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Never the real client: under vitest DATABASE_URL may name production.
vi.mock('#/db', () => ({ db: {} }));

import {
  FIRST_RUN_LABELS,
  LESSON_VERSIONS_STATEMENTS,
  migrateLessonVersions,
} from '../migrate-lesson-versions';
import * as schema from '../schema';
import { createDb, type FreshDb, freshDb } from './support/local-pg';

const sqls = () =>
  [...LESSON_VERSIONS_STATEMENTS, ...Object.values(FIRST_RUN_LABELS)].map(
    (s) => new PgDialect().sqlToQuery(s).sql,
  );

describe('migrate-lesson-versions', () => {
  it('never drops or truncates data', () => {
    expect(sqls().length).toBeGreaterThan(0);
    for (const s of sqls())
      expect(s).not.toMatch(/drop (table|column)|truncate|delete\s+from/i);
  });

  it('every create, add column and drop index is re-runnable', () => {
    for (const s of sqls()) {
      if (/^\s*create|add column/i.test(s)) expect(s).toMatch(/if not exists/i);
      if (/drop index/i.test(s)) expect(s).toMatch(/if exists/i);
    }
  });
});

/**
 * Raw SQL, because drizzle's inserts name every column of today's schema and
 * these rows exist before the migration adds some of them. A new database, so
 * ids count from 1 in insert order:
 * course 1 owns module 1 (M) and course 2 borrows it; M holds lesson 1 (A,
 * flagship discipline, two material rows) and lesson 2 (B, no material);
 * lesson 3 (C) is unplaced, with material.
 */
const SEED = `
  insert into organizations (name) values ('Org');
  insert into disciplines (org_id, name, slug)
    values (1, '3D Airmanship', '3d-airmanship'), (1, 'UAS', 'uas');
  insert into courses (name, slug) values ('One', 'one'), ('Two', 'two');
  insert into modules (course_id, name, slug, required_subscriptions)
    values (1, 'M', 'm', '{}');
  insert into course_modules (course_id, module_id, rank) values (1, 1, 1), (2, 1, 1);
  insert into lessons (name, slug, required_subscriptions, org_id, discipline_id,
      video_provider, video_ref, other_video_ids, updated_at) values
    ('A', 'a', '{}', 1, 1, 'mux', 'ref-a', '[{"language":"hi"}]', '2026-01-05'),
    ('B', 'b', '{}', 1, 2, null, null, '[]', '2026-01-02'),
    ('C', 'c', '{}', 1, null, null, null, '[]', '2026-01-03');
  insert into module_lessons (module_id, lesson_id, rank) values (1, 1, 1), (1, 2, 2);
  insert into lesson_material (lesson_slug, text, key_points, quiz, pro_tips,
      links, assignments, job_of_the_day, test_this, updated_at) values
    ('a', 'first', '["k1","k2"]', '[{"q":1}]', 'tips', '[{"url":"u"}]', 'asg',
      'https://job', '[{"url":"t"}]', '2026-01-09'),
    ('a', 'second', null, null, null, null, null, null, null, '2026-01-01'),
    ('c', 'c text', null, null, null, null, null, null, null, '2026-01-04');
  insert into lesson_knowledge_chunks (lesson_id, version, source_fingerprint, chunks)
    values (1, 1, 'fp', '[]'), (3, 1, 'fp', '[]');
  insert into docs (lesson_slug, source_path, chunk, embedding) values
    ('a', 'lesson:a', 'a1', array_fill(0.1::real, array[3072])::vector),
    ('a', 'lesson:a', 'a2', array_fill(0.1::real, array[3072])::vector),
    ('c', 'lesson:c', 'c1', array_fill(0.1::real, array[3072])::vector),
    (null, 'upload.pdf', 'u1', array_fill(0.1::real, array[3072])::vector);
`;

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'migrate-lesson-versions on Postgres',
  () => {
    let pgDb: FreshDb;
    const rows = async (q: string) => (await pgDb.pool.query(q)).rows;
    const migrate = () => migrateLessonVersions(pgDb.db);
    const snapshots = () =>
      rows('select lesson_id, version, name from lesson_versions order by id');
    const pins = () =>
      rows(`select p.course_id, p.lesson_id, v.version
        from course_lesson_versions p
        join lesson_versions v on v.id = p.lesson_version_id and v.lesson_id = p.lesson_id
        order by 1, 2`);

    beforeEach(async () => {
      pgDb = await freshDb({ migrated: false });
    });
    afterEach(() => pgDb?.drop());

    it('snapshots and pins every course showing a lesson, borrowed included', async () => {
      await pgDb.pool.query(SEED);
      await migrate();

      expect(await pins()).toEqual([
        { course_id: 1, lesson_id: 1, version: '1.0' },
        { course_id: 1, lesson_id: 2, version: '1.0' },
        { course_id: 2, lesson_id: 1, version: '1.0' },
        { course_id: 2, lesson_id: 2, version: '1.0' },
      ]);
      const { id, createdAt, ...a } = (
        await pgDb.db.select().from(schema.lessonVersionsTable)
      ).find((v) => v.lessonId === 1) as Record<string, unknown>;
      // Everything the working copy holds, from the FIRST material row by id.
      expect(a).toEqual({
        lessonId: 1,
        version: '1.0',
        name: 'A',
        videoProvider: 'mux',
        videoRef: 'ref-a',
        otherVideoIds: [{ language: 'hi' }],
        text: 'first',
        keyPoints: ['k1', 'k2'],
        quiz: [{ q: 1 }],
        proTips: 'tips',
        links: [{ url: 'u' }],
        assignments: 'asg',
        jobOfTheDay: 'https://job',
        testThis: [{ url: 't' }],
        extraTab: 'jobOfTheDay',
      });
      // No material: text null. Not the flagship discipline: TEST THIS!.
      expect(
        await rows(
          'select lesson_id, text, quiz, extra_tab from lesson_versions where lesson_id <> 1',
        ),
      ).toEqual([
        { lesson_id: 2, text: null, quiz: null, extra_tab: 'testThis' },
      ]);
    });

    it('lifts the old uniqueness of a version, keeping every snapshot', async () => {
      await pgDb.pool.query(SEED);
      await migrate();
      // As the first release of lesson versions left it.
      await pgDb.pool.query(`
        drop index lesson_versions_lesson_id_version_idx;
        create unique index lesson_versions_lesson_version_idx
          on lesson_versions (lesson_id, version)`);
      const before = [await snapshots(), await pins()];
      await migrate();
      expect([await snapshots(), await pins()]).toEqual(before);
      await pgDb.pool.query(`insert into lesson_versions
        (lesson_id, version, name, extra_tab) values (1, '1.0', 'again', 'testThis')`);
      expect(
        await rows(
          `select name from lesson_versions where lesson_id = 1 and version = '1.0'`,
        ),
      ).toHaveLength(2);
    });

    it('labels existing chunk and lesson doc rows', async () => {
      await pgDb.pool.query(SEED);
      await migrate();
      const [{ id }] = await rows(
        'select id from lesson_versions where lesson_id = 1',
      );
      expect(
        await rows(
          'select lesson_id, lesson_version_id from lesson_knowledge_chunks order by 1',
        ),
      ).toEqual([
        { lesson_id: 1, lesson_version_id: id },
        { lesson_id: 3, lesson_version_id: null },
      ]);
      expect(
        await rows('select chunk, lesson_version_id from docs order by 1'),
      ).toEqual([
        { chunk: 'a1', lesson_version_id: id },
        { chunk: 'a2', lesson_version_id: id },
        { chunk: 'c1', lesson_version_id: null },
        { chunk: 'u1', lesson_version_id: null },
      ]);
    });

    it('is re-runnable and picks up later placements', async () => {
      await pgDb.pool.query(SEED);
      await migrate();
      const before = [await snapshots(), await pins()];
      await migrate();
      expect([await snapshots(), await pins()]).toEqual(before);

      await pgDb.pool.query(
        'insert into module_lessons (module_id, lesson_id, rank) values (1, 3, 3)',
      );
      await migrate();
      expect(await snapshots()).toEqual([
        ...before[0],
        { lesson_id: 3, version: '1.0', name: 'C' },
      ]);
      expect((await pins()).filter((p) => p.lesson_id === 3)).toEqual([
        { course_id: 1, lesson_id: 3, version: '1.0' },
        { course_id: 2, lesson_id: 3, version: '1.0' },
      ]);
    });

    it('a re-run neither takes a version being worked on nor moves a pin', async () => {
      await pgDb.pool.query(SEED);
      await migrate();
      // Both lessons go to 1.1; course 2 takes A's, nobody takes B's.
      await pgDb.pool.query(`
        update lessons set version = '1.1', name = name || '!' where id in (1, 2);
        insert into lesson_versions (lesson_id, version, name, extra_tab)
          values (1, '1.1', 'A!', 'jobOfTheDay');
        update course_lesson_versions set lesson_version_id =
            (select id from lesson_versions where lesson_id = 1 and version = '1.1')
          where course_id = 2 and lesson_id = 1;
      `);
      await migrate();
      expect(await pins()).toEqual([
        { course_id: 1, lesson_id: 1, version: '1.0' },
        { course_id: 1, lesson_id: 2, version: '1.0' },
        { course_id: 2, lesson_id: 1, version: '1.1' },
        { course_id: 2, lesson_id: 2, version: '1.0' },
      ]);
      expect((await snapshots()).map((s) => [s.lesson_id, s.version])).toEqual([
        [1, '1.0'],
        [2, '1.0'],
        [1, '1.1'],
      ]);
    });

    const cDocs = () =>
      rows(`select d.chunk, v.text from docs d
        left join lesson_versions v on v.id = d.lesson_version_id
        where d.lesson_slug = 'c' order by 1`);

    it('a later run leaves old search rows off a snapshot the new code indexed', async () => {
      await pgDb.pool.query(SEED);
      await migrate();
      await pgDb.pool.query(`
        update lesson_material set text = 'NEW' where lesson_slug = 'c';
        insert into module_lessons (module_id, lesson_id, rank) values (1, 3, 3);
        insert into lesson_versions (lesson_id, version, name, text, extra_tab)
          values (3, '1.0', 'C', 'NEW', 'testThis');
        insert into docs (lesson_slug, lesson_version_id, source_path, chunk, embedding)
          select 'c', id, 'lesson:c@1.0', 'c-new', array_fill(0.1::real, array[3072])::vector
          from lesson_versions where lesson_id = 3;
      `);
      await migrate();
      expect(await cDocs()).toEqual([
        { chunk: 'c-new', text: 'NEW' },
        { chunk: 'c1', text: null },
      ]);
    });

    it('a later run leaves the snapshot it takes unindexed rather than label old search rows', async () => {
      await pgDb.pool.query(SEED);
      await migrate();
      await pgDb.pool.query(`
        update lesson_material set text = 'NEW' where lesson_slug = 'c';
        insert into module_lessons (module_id, lesson_id, rank) values (1, 3, 3);
      `);
      await migrate();
      expect(
        await rows('select text from lesson_versions where lesson_id = 3'),
      ).toEqual([{ text: 'NEW' }]);
      expect(await cDocs()).toEqual([{ chunk: 'c1', text: null }]);
    });

    it('a later run leaves unlabelled chunk rows alone and does not abort when a lesson has two of them', async () => {
      await pgDb.pool.query(SEED);
      await migrate();
      await pgDb.pool.query(`
        insert into module_lessons (module_id, lesson_id, rank) values (1, 3, 3);
        insert into lesson_knowledge_chunks (lesson_id, version, source_fingerprint, chunks)
          values (3, 2, 'fp2', '[]');
      `);
      await migrate();
      expect(
        await rows(
          `select source_fingerprint as fp, lesson_version_id as v
           from lesson_knowledge_chunks where lesson_id = 3 order by 1`,
        ),
      ).toEqual([
        { fp: 'fp', v: null },
        { fp: 'fp2', v: null },
      ]);
      expect((await pins()).filter((p) => p.lesson_id === 3)).toHaveLength(2);
    });

    it('a rolled-back run does not count as the first', async () => {
      await pgDb.pool.query(SEED);
      // Fails after the lesson_version_id columns are added.
      await pgDb.pool.query('alter table module_lessons rename to gone');
      await expect(migrate()).rejects.toThrow();
      await pgDb.pool.query('alter table gone rename to module_lessons');
      await migrate();
      expect(
        await rows(`select 'doc' as what from docs where lesson_version_id is not null
          union all
          select 'chunks' from lesson_knowledge_chunks where lesson_version_id is not null
          order by 1`),
      ).toEqual([{ what: 'chunks' }, { what: 'doc' }, { what: 'doc' }]);
    });

    it('gives up rather than queue everyone behind a long-running reader', async () => {
      const reader = new pg.Client({ ...pgDb.pool.options });
      await reader.connect();
      try {
        await reader.query('begin; select 1 from lessons');
        // 55P03: lock_not_available.
        await expect(migrate()).rejects.toMatchObject({
          cause: { code: '55P03' },
        });
      } finally {
        await reader.end();
      }
    }, 15_000);

    it('backfills content_updated_at once', async () => {
      await pgDb.pool.query(SEED);
      await migrate();
      const dates = () =>
        rows(
          `select slug, content_updated_at::date::text as d from lessons order by 1`,
        );
      expect(await dates()).toEqual([
        { slug: 'a', d: '2026-01-09' }, // material is later
        { slug: 'b', d: '2026-01-02' }, // no material
        { slug: 'c', d: '2026-01-04' },
      ]);
      await pgDb.pool.query(
        `update lessons set content_updated_at = '2026-03-01' where slug = 'a'`,
      );
      await migrate();
      expect((await dates())[0]).toEqual({ slug: 'a', d: '2026-03-01' });
    });

    it('rolls back whole when a statement fails', async () => {
      await pgDb.pool.query(SEED);
      // `docs` is touched last: without it every earlier statement must undo.
      await pgDb.pool.query('alter table docs rename to docs_gone');
      await expect(migrate()).rejects.toThrow();
      expect(await rows(`select to_regclass('lesson_versions') as t`)).toEqual([
        { t: null },
      ]);
    });

    /**
     * The migration is hand-written, so nothing else keeps it in step with
     * `schema.ts`. Postgres's own catalogue is the referee: the fixture plus
     * the migration, against a database built straight from `schema.ts`.
     */
    it('leaves the touched tables exactly as schema.ts declares them', async () => {
      const declared = await createDb(
        (
          await generateMigration(
            generateDrizzleJson({}),
            generateDrizzleJson(schema),
          )
        ).join('\n'),
      );
      try {
        await migrate();
        const describeTables = async ({ pool }: FreshDb) =>
          (
            await pool.query(`
              with t(oid) as (select unnest(array['lessons', 'lesson_versions',
                'course_lesson_versions', 'removed_placements', 'lesson_knowledge_chunks', 'docs']::regclass[])::oid)
              select a.attrelid::regclass || '.' || a.attname as what,
                  concat_ws(' ', format_type(a.atttypid, a.atttypmod), nullif(a.attnotnull, false),
                    nullif(a.attidentity, ''), pg_get_expr(d.adbin, d.adrelid)) as def
                from pg_attribute a join t on t.oid = a.attrelid
                left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                where a.attnum > 0 and not a.attisdropped
              union all
              select i.indexrelid::regclass::text, pg_get_indexdef(i.indexrelid)
                from pg_index i join t on t.oid = i.indrelid
              union all
              select c.conrelid::regclass || ' ' || c.conname, pg_get_constraintdef(c.oid)
                from pg_constraint c join t on t.oid = c.conrelid
              order by 1`)
          ).rows;
        const migrated = await describeTables(pgDb);
        expect(migrated.map((r) => r.what)).toEqual(
          expect.arrayContaining([
            'lessons.version',
            'lesson_versions.text',
            'course_lesson_versions.updated_at',
            'removed_placements.depends_on',
            'docs.lesson_version_id',
          ]),
        );
        expect(migrated).toEqual(await describeTables(declared));
      } finally {
        await declared.drop();
      }
    });
  },
);
