// @vitest-environment node
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#/db', () => ({ db: {} }));

import { DEBRIEF_REVIEW_STATEMENTS } from '../migrate-debrief-review';

const sqls = () =>
  DEBRIEF_REVIEW_STATEMENTS.map((s) => new PgDialect().sqlToQuery(s).sql);

describe('migrate-debrief-review', () => {
  it('has the five statements', () => {
    expect(sqls()).toHaveLength(5);
  });

  it('only adds — every statement is re-runnable', () => {
    for (const s of sqls()) {
      expect(s).toMatch(/if not exists/i);
      // `on delete cascade` is a legitimate FK clause, so only match
      // destructive statements, not the bare word.
      expect(s).not.toMatch(/\b(drop|truncate)\b|\bdelete\s+from\b/i);
    }
  });

  it('creates both new tables and their unique indexes', () => {
    const all = sqls().join('\n');
    expect(all).toMatch(/create table if not exists "lesson_completions"/i);
    expect(all).toMatch(/create table if not exists "prepared_debriefs"/i);
    expect(all).toMatch(
      /create unique index if not exists "lesson_completions_user_lesson_idx"/i,
    );
    expect(all).toMatch(
      /create unique index if not exists "prepared_debriefs_user_course_lesson_idx"/i,
    );
  });

  it('indexes lesson_test_results by user, lesson and completion time', () => {
    expect(sqls().join('\n')).toMatch(
      /create index if not exists "lesson_test_results_user_lesson_completed_idx" on "lesson_test_results" \("user_id","lesson_slug","completed_at"\)/i,
    );
  });
});
