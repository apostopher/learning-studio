// @vitest-environment node
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#/db', () => ({ db: {} }));

import { PASS_MARK_STATEMENTS } from '../migrate-pass-mark';

const sqls = () =>
  PASS_MARK_STATEMENTS.map((s) => new PgDialect().sqlToQuery(s).sql);

describe('migrate-pass-mark', () => {
  it('every statement is re-runnable', () => {
    for (const s of sqls()) {
      const guarded =
        /if not exists/i.test(s) ||
        (/^\s*do\b/i.test(s) && /pg_constraint/i.test(s));
      expect(guarded).toBe(true);
    }
  });

  it('nothing is destructive', () => {
    for (const s of sqls()) {
      expect(s).not.toMatch(/\b(drop|truncate)\b|\bdelete\s+from\b/i);
    }
  });

  it('adds the pass_mark column defaulting to 85', () => {
    expect(sqls().join('\n')).toContain(
      `add column if not exists "pass_mark" integer not null default 85`,
    );
  });

  it('adds courses_pass_mark_check bounding 0 to 100', () => {
    const check = sqls().find((s) => s.includes('courses_pass_mark_check'));
    expect(check).toBeDefined();
    expect(check).toMatch(/between 0 and 100/);
  });
});
