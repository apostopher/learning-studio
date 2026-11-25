// @vitest-environment node
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ db: null as unknown }));
// Never the real client: under vitest DATABASE_URL may name production.
vi.mock('#/db', () => ({
  get db() {
    return h.db;
  },
}));

import { OFFERING_ARRIVE_AT_STATEMENTS } from '../migrate-offering-arrive-at';
import { createOffering, listOfferings, updateOffering } from '../offerings';
import { type FreshDb, freshDb } from './support/local-pg';

describe('migrate-offering-arrive-at', () => {
  it('only adds, and is re-runnable', () => {
    expect(OFFERING_ARRIVE_AT_STATEMENTS).not.toHaveLength(0);
    for (const statement of OFFERING_ARRIVE_AT_STATEMENTS) {
      const { sql } = new PgDialect().sqlToQuery(statement);
      expect(sql).toMatch(/add column if not exists/i);
      expect(sql).not.toMatch(/drop|truncate|delete|not null/i);
    }
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'an offering’s arrival date, on Postgres',
  () => {
    let pgDb: FreshDb;
    beforeAll(async () => {
      pgDb = await freshDb({ migrated: true });
      h.db = pgDb.db;
      await pgDb.pool.query(`
        insert into courses (name, slug) values ('2 Week', 'two');
        insert into offerings (course_id, starts_on, ends_on)
          values (1, '2026-11-01', '2026-11-02');`);
      // Twice: the second run is a no-op.
      for (let run = 0; run < 2; run++) {
        for (const statement of OFFERING_ARRIVE_AT_STATEMENTS)
          await pgDb.db.execute(statement);
      }
    });
    afterAll(() => pgDb?.drop());

    const DATES = { startsOn: '2026-11-17', endsOn: '2027-01-18', userIds: [] };
    const listed = async (id: number) =>
      (
        await listOfferings({
          windowStart: '2026-01-01',
          windowEnd: '2027-12-31',
        })
      ).find((o) => o.id === id)?.arriveAt;

    it('is empty on an offering from before it', async () => {
      expect(await listed(1)).toBeNull();
    });

    it('is stored on create, changed, kept when not sent, and cleared', async () => {
      const { id, arriveAt } = await createOffering(
        { courseId: 1, ...DATES, arriveAt: '2027-01-19' },
        null,
      );
      expect(arriveAt).toBe('2027-01-19');
      expect(await listed(id)).toBe('2027-01-19');

      await updateOffering(id, { ...DATES, arriveAt: '2027-01-20' }, null);
      expect(await listed(id)).toBe('2027-01-20');

      await updateOffering(id, DATES, null);
      expect(await listed(id)).toBe('2027-01-20');

      await updateOffering(id, { ...DATES, arriveAt: null }, null);
      expect(await listed(id)).toBeNull();
    });
  },
);
