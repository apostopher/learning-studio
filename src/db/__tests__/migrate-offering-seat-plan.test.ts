// @vitest-environment node
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

// Never the real client: under vitest DATABASE_URL may name production.
vi.mock('#/db', () => ({ db: null }));

import { OFFERING_SEAT_PLAN_STATEMENTS } from '../migrate-offering-seat-plan';

describe('migrate-offering-seat-plan', () => {
  it('only adds a column that defaults every seat to paid, and is re-runnable', () => {
    expect(OFFERING_SEAT_PLAN_STATEMENTS).toHaveLength(1);
    const { sql } = new PgDialect().sqlToQuery(
      OFFERING_SEAT_PLAN_STATEMENTS[0],
    );
    expect(sql).toMatch(/add column if not exists "plan"/i);
    expect(sql).toMatch(/default 'paid'/i);
    expect(sql).not.toMatch(/drop|truncate|delete|update/i);
  });
});
