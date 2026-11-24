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
import { type FreshDb, freshDb } from '#/db/__tests__/support/local-pg';

const h = vi.hoisted(() => ({
  db: null as unknown,
  embed: vi.fn(),
  embedMany: vi.fn(),
}));
vi.mock('#/db', () => ({
  get db() {
    return h.db;
  },
}));
// No embedding call leaves the machine.
vi.mock('ai', () => ({ embed: h.embed, embedMany: h.embedMany }));
vi.mock('#/ai/gemini', () => ({ embeddingModel: 'embedding-model' }));

const { indexLessonVersions, unindexedLessonVersionIds } = await import(
  '#/lib/index-lesson-versions.server'
);
const { newestVersionIdForSlug, searchKB } = await import(
  '#/db/knowledge-base'
);

/** Every text embeds to the same vector, so every row is a perfect match. */
const VECTOR = Array.from({ length: 3072 }, (_, i) => (i === 0 ? 1 : 0));
const VECTOR_SQL = `'[${VECTOR.join(',')}]'`;
const METAR = 'METARs are routine reports, issued hourly.';

/**
 * Lesson 1 (wx) has snapshots 1 (1.9) and 2 (1.10), same text; lesson 2
 * (brief) has snapshot 3 with only pro tips and 4 with nothing worth a chunk;
 * lesson 3 (draft) was never taken. Two uploads, and a lesson row from before
 * lesson versions.
 */
const SEED = `
  truncate organizations, courses, lessons, docs restart identity cascade;
  insert into organizations (name) values ('Org');
  insert into courses (name, slug) values ('One', 'one');
  insert into lessons (name, slug, required_subscriptions, org_id) values
    ('WX', 'wx', '{}', 1), ('Brief', 'brief', '{}', 1), ('Draft', 'draft', '{}', 1);
  insert into lesson_versions (lesson_id, version, name, text, pro_tips, extra_tab) values
    (1, '1.9', 'WX', '<p>${METAR}</p>', null, 'testThis'),
    (1, '1.10', 'WX', '<p>${METAR}</p>', null, 'testThis'),
    (2, '1.0', 'Brief', null, 'Brief the crosswind limit every time.', 'testThis'),
    (2, '1.1', 'Brief', '<p> </p>', '', 'testThis');
  insert into docs (course_id, lesson_slug, source_path, heading, chunk, embedding) values
    (null, null, 'file-shared.pdf', 'h', 'shared upload', ${VECTOR_SQL}),
    (1, null, 'file-course.pdf', 'h', 'course upload', ${VECTOR_SQL}),
    (null, 'wx', 'lesson:wx', 'Section 1',
      'Name: lesson:wx > Section: Section 1' || chr(10) || chr(10) || '${METAR}', ${VECTOR_SQL});
`;

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'lesson snapshots in search, on Postgres',
  () => {
    let pgDb: FreshDb;
    const rows = async (q: string) => (await pgDb.pool.query(q)).rows;
    const snapshotRows = () =>
      rows(`select lesson_version_id as id, lesson_slug, source_path from docs
        where lesson_version_id is not null order by 1, docs.id`);
    const legacyAndUploads = async () =>
      (
        await rows(
          'select chunk from docs where lesson_version_id is null order by id',
        )
      ).map((r) => r.chunk);
    const found = async (courseId: number | null, lessonVersionIds: number[]) =>
      (await searchKB('what is a METAR', { courseId, lessonVersionIds }))
        .map((r) => r.chunk)
        .sort();

    beforeAll(async () => {
      pgDb = await freshDb({ migrated: true });
      h.db = pgDb.db;
      // Postgres 14 loads the docs unique key without NULLS NOT DISTINCT
      // (see local-pg); this one collides where production's does.
      await pgDb.pool.query(`create unique index docs_production_key on docs
        (coalesce(course_id, -1), source_path, coalesce(heading, ''), chunk)`);
    });
    afterAll(() => pgDb?.drop());
    beforeEach(async () => {
      vi.clearAllMocks();
      h.embed.mockResolvedValue({ embedding: VECTOR });
      h.embedMany.mockImplementation(
        async ({ values }: { values: string[] }) => ({
          embeddings: values.map(() => VECTOR),
        }),
      );
      await pgDb.pool.query(SEED);
    });

    it('indexes each snapshot under its own rows, beside the older ones', async () => {
      const before = await legacyAndUploads();
      expect(await indexLessonVersions([1, 2])).toEqual({
        indexed: 2,
        failed: [],
      });
      expect(await snapshotRows()).toEqual([
        { id: 1, lesson_slug: 'wx', source_path: 'lesson:wx@1.9' },
        { id: 2, lesson_slug: 'wx', source_path: 'lesson:wx@1.10' },
      ]);
      expect(await legacyAndUploads()).toEqual(before);
    });

    it('re-indexing a snapshot replaces its own rows and no other', async () => {
      await indexLessonVersions([1, 2]);
      const [{ id: kept }] = await rows(
        'select id from docs where lesson_version_id = 1',
      );
      // Labelled by the migration: an old row that is already this snapshot's.
      await pgDb.pool.query(`insert into docs
        (lesson_slug, lesson_version_id, source_path, heading, chunk, embedding)
        values ('wx', 2, 'lesson:wx', 'Section 9', 'labelled', ${VECTOR_SQL})`);

      await indexLessonVersions([2]);
      expect(await snapshotRows()).toEqual([
        { id: 1, lesson_slug: 'wx', source_path: 'lesson:wx@1.9' },
        { id: 2, lesson_slug: 'wx', source_path: 'lesson:wx@1.10' },
      ]);
      expect(
        await rows('select id from docs where lesson_version_id = 1'),
      ).toEqual([{ id: kept }]);
    });

    it('two requests indexing one snapshot at once leave one set of rows', async () => {
      // Without the production key, so it is not what saves us.
      await pgDb.pool.query('drop index docs_production_key');
      try {
        await Promise.all(
          Array.from({ length: 8 }, () => indexLessonVersions([1])),
        );
        expect(await snapshotRows()).toHaveLength(1);
      } finally {
        await pgDb.pool.query('truncate docs');
        await pgDb.pool.query(`create unique index docs_production_key on docs
          (coalesce(course_id, -1), source_path, coalesce(heading, ''), chunk)`);
      }
    });

    it('indexes a lesson whose material is only pro tips', async () => {
      await indexLessonVersions([3]);
      expect(await found(null, [3])).toEqual([
        expect.stringContaining('Pro tips: Brief the crosswind limit'),
        'shared upload',
      ]);
    });

    it('one failure neither throws nor stops the rest, and is left to the script', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      h.embedMany.mockRejectedValueOnce(new Error('quota'));
      expect(await indexLessonVersions([1, 2, 999])).toEqual({
        indexed: 1,
        failed: [1, 999],
      });
      expect(error).toHaveBeenCalledTimes(2);
      error.mockRestore();

      expect(await unindexedLessonVersionIds()).toEqual([1, 3]);
    });

    it('a failed write leaves the rows that were there', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      await indexLessonVersions([1]);
      const before = await snapshotRows();
      // Wrong size: refused by the insert, after the delete.
      h.embedMany.mockResolvedValueOnce({ embeddings: [[1, 2]] });
      expect(await indexLessonVersions([1])).toEqual({
        indexed: 0,
        failed: [1],
      });
      error.mockRestore();
      expect(await snapshotRows()).toEqual(before);
    });

    it('the database being down fails every id without throwing', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      h.db = {
        select: () => {
          throw new Error('down');
        },
      };
      try {
        expect(await indexLessonVersions([1, 2])).toEqual({
          indexed: 0,
          failed: [1, 2],
        });
      } finally {
        h.db = pgDb.db;
        error.mockRestore();
      }
    });

    it('unindexed: has something to search and no rows of its own', async () => {
      // 4 has nothing that makes a chunk; it would come back on every run.
      expect(await unindexedLessonVersionIds()).toEqual([1, 2, 3]);
      await indexLessonVersions(await unindexedLessonVersionIds());
      expect(await unindexedLessonVersionIds()).toEqual([]);
    });

    it("search returns the asked snapshots and uploads, never another version's or an unlabelled lesson row", async () => {
      await indexLessonVersions([1, 2]);
      const uploads = ['course upload', 'shared upload'];
      expect(await found(1, [])).toEqual(uploads);
      const one = await found(1, [1]);
      expect(one).toHaveLength(3);
      expect(one).toEqual([expect.stringContaining(METAR), ...uploads]);
      expect(await found(1, [4])).toEqual(uploads);
    });

    it('deleting a lesson takes its search rows, not the uploads', async () => {
      await indexLessonVersions([1, 2, 3]);
      await pgDb.pool.query(`delete from lessons where slug = 'wx'`);
      expect((await snapshotRows()).map((r) => r.id)).toEqual([3]);
      expect(await found(1, [])).toEqual(['course upload', 'shared upload']);
    });

    it('newest snapshot is the highest by number; none when never taken', async () => {
      expect(await newestVersionIdForSlug('wx')).toBe(2);
      expect(await newestVersionIdForSlug('brief')).toBe(4);
      expect(await newestVersionIdForSlug('draft')).toBeNull();
      expect(await newestVersionIdForSlug('nope')).toBeNull();
    });
  },
);
