// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FreshDb, freshDb } from './support/local-pg';

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('#/db', () => ({
  get db() {
    return h.db;
  },
}));
vi.mock('@/integrations/upstash/redis', () => ({
  cacheWithRedis: (_prefix: string, fn: unknown) => fn,
}));
vi.mock('@/db/schema', () => vi.importActual('#/db/schema'));

const { getCourseDetails } = await import('../course');

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'getCourseDetails on Postgres',
  () => {
    let pgDb: FreshDb;
    beforeAll(async () => {
      pgDb = await freshDb({ migrated: true });
      h.db = pgDb.db;
      await pgDb.pool.query(`
        insert into organizations (name) values ('Org');
        insert into courses (name, slug) values ('One', 'one');
        insert into modules (course_id, name, slug, required_subscriptions)
          values (1, 'M', 'm', '{}');
        insert into course_modules (course_id, module_id, rank) values (1, 1, 1);
        insert into lessons (name, slug, required_subscriptions, org_id, is_available)
          values ('A', 'a', '{}', 1, true);
        insert into module_lessons (module_id, lesson_id, rank) values (1, 1, 1);
      `);
    });
    afterAll(() => pgDb?.drop());

    it('serves lessons without their version or content edit time', async () => {
      const lesson = (await getCourseDetails('one'))?.modules[0].lessons[0];
      expect(lesson).toMatchObject({ id: 1, slug: 'a', hasVideo: false });
      expect(lesson).not.toHaveProperty('version');
      expect(lesson).not.toHaveProperty('contentUpdatedAt');
    });
  },
);
