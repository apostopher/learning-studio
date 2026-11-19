// @vitest-environment node
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#/db', () => ({ db: {} }));

import { DOC_SOURCE_STATEMENTS } from '../migrate-doc-source';

const sqls = () =>
  DOC_SOURCE_STATEMENTS.map((s) => new PgDialect().sqlToQuery(s).sql);

describe('migrate-doc-source', () => {
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

  it('adds the source column defaulting to 3d-airmanship', () => {
    expect(sqls().join('\n')).toContain(
      `add column if not exists "source" text not null default '3d-airmanship'`,
    );
  });

  it('adds docs_source_check allowing both values', () => {
    const check = sqls().find((s) => s.includes('docs_source_check'));
    expect(check).toBeDefined();
    expect(check).toContain(`'itps'`);
    expect(check).toContain(`'3d-airmanship'`);
  });
});
