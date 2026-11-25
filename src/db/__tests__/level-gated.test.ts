// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FreshDb, freshDb } from './support/local-pg';

const h = vi.hoisted(() => ({
  db: null as unknown,
  dbModule: () => ({
    get db() {
      return h.db;
    },
  }),
}));
vi.mock('#/db', () => h.dbModule());
vi.mock('@/db', () => h.dbModule());
vi.mock('@/db/schema', () => vi.importActual('#/db/schema'));
vi.mock('@/integrations/upstash/redis', () => ({
  cacheWithRedis: (_key: string, read: unknown) =>
    Object.assign(read as () => unknown, { invalidate: vi.fn() }),
}));
// Everything else `course` reaches outside Postgres.
vi.mock('#/integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache: vi.fn(),
}));
vi.mock('#/lib/video-providers/resolve.server', () => ({
  resolvePlayback: vi.fn(),
  validateCredentials: vi.fn(),
}));
vi.mock('#/db/video-captions', () => ({ muxCaptionsForPlayback: vi.fn() }));
vi.mock('#/db/lesson-playback', () => ({
  getLessonPlayback: Object.assign(vi.fn(), { invalidate: vi.fn() }),
}));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));

const { getCourseDetails, getMyCourses } = await import('../course');
const { linkLesson } = await import('../placements');

/** One untagged lesson per kind of discipline, each alone in its course. */
const SEED = `
  insert into organizations (name) values ('Org');
  insert into disciplines (org_id, name, slug)
    values (1, 'Renamed since', '3d-airmanship'), (1, 'UAS', 'uas');
  insert into courses (name, slug) values ('One', 'one'), ('Two', 'two'), ('Three', 'three');
  insert into course_orgs (course_id, org_id) values (1, 1), (2, 1), (3, 1);
  insert into modules (course_id, name, slug, required_subscriptions) values
    (1, 'M1', 'm1', '{}'), (2, 'M2', 'm2', '{}'), (3, 'M3', 'm3', '{}');
  insert into course_modules (course_id, module_id, rank) values (1, 1, 1), (2, 2, 1), (3, 3, 1);
  insert into lessons (name, slug, required_subscriptions, org_id, discipline_id,
      other_video_ids, is_available, levels) values
    ('A', 'a', '{}', 1, 1, '[]', true, '{}'),
    ('B', 'b', '{}', 1, 2, '[]', true, '{}'),
    ('C', 'c', '{}', 1, null, '[]', true, '{none}');
  insert into user_profiles (user_id, email) values ('u1', 'u1@t.t');
  insert into course_subscriptions (user_id, course_id)
    select 'u1', generate_series(1, 3);
  insert into lesson_material_progress (user_id, lesson_slug, section_name, completed)
    select 'u1', s, 'page', true from unnest(array['a', 'b', 'c']) s;
`;

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'levels gate only 3D Airmanship lessons, on Postgres',
  () => {
    let pgDb: FreshDb;
    beforeAll(async () => {
      pgDb = await freshDb({ migrated: true });
      h.db = pgDb.db;
      await pgDb.pool.query(SEED);
      for (const id of [1, 2, 3]) {
        await linkLesson({
          moduleId: id,
          lessonId: id,
          prevLessonId: null,
          nextLessonId: null,
        });
      }
    });
    afterAll(() => pgDb?.drop());

    it('says so in the course payload, by discipline slug', async () => {
      const gated = async (slug: string) =>
        (await getCourseDetails(slug))?.modules[0].lessons.map((l) => [
          l.slug,
          l.levelGated,
        ]);
      expect(await gated('one')).toEqual([['a', true]]);
      expect(await gated('two')).toEqual([['b', false]]);
      expect(await gated('three')).toEqual([['c', false]]);
    });

    it('opens the rest to a pilot with no level, on their course cards', async () => {
      const cards = await getMyCourses('u1');
      expect(
        Object.fromEntries(cards.map((c) => [c.slug, c.resume.kind])),
      ).toEqual({ one: 'none', two: 'lesson', three: 'lesson' });
      const percent = Object.fromEntries(cards.map((c) => [c.slug, c.percent]));
      expect(percent.one).toBe(0);
      expect(percent.two).toBeGreaterThan(0);
      expect(percent.three).toBeGreaterThan(0);
    });
  },
);
