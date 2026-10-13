// @vitest-environment node
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#/db', () => ({ db: {} }));

import { VIPER_CONTEXT_STATEMENTS } from '../migrate-viper-context';

const sqls = () =>
  VIPER_CONTEXT_STATEMENTS.map((s) => new PgDialect().sqlToQuery(s).sql);

describe('migrate-viper-context', () => {
  it('only adds — every statement is re-runnable', () => {
    for (const s of sqls()) {
      expect(s).toMatch(/if not exists/i);
      // `on delete cascade` is a legitimate FK clause, so only match
      // destructive statements, not the bare word.
      expect(s).not.toMatch(/\b(drop|truncate)\b|\bdelete\s+from\b/i);
    }
  });

  it('adds the three columns and the lesson index', () => {
    const all = sqls().join('\n');
    expect(all).toMatch(
      /"docs" add column if not exists "lesson_slug" text references "lessons"\("slug"\) on delete cascade/i,
    );
    expect(all).toMatch(/create index if not exists "docs_lesson_slug_idx"/i);
    expect(all).toMatch(/"ai_chats" add column if not exists "summary" text/i);
    expect(all).toMatch(
      /"ai_chats" add column if not exists "summarized_through_order" integer/i,
    );
  });
});
