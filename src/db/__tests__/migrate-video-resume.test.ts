// @vitest-environment node
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#/db', () => ({ db: {} }));

import { VIDEO_RESUME_STATEMENTS } from '../migrate-video-resume';

const sqls = () =>
  VIDEO_RESUME_STATEMENTS.map((s) => new PgDialect().sqlToQuery(s).sql);

describe('migrate-video-resume', () => {
  it('only adds — every statement is re-runnable', () => {
    for (const s of sqls()) {
      expect(s).toMatch(/if not exists/i);
      expect(s).not.toMatch(/\b(drop|truncate)\b|\bdelete\s+from\b/i);
    }
  });

  it('creates the table keyed on (user, lesson) so a save can upsert', () => {
    const all = sqls().join('\n');
    expect(all).toMatch(/create table if not exists "video_resume_positions"/i);
    expect(all).toMatch(/primary key \("user_id", "lesson_id"\)/i);
  });
});
