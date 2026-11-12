// @vitest-environment node
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#/db', () => ({ db: {} }));

import { getTableConfig } from 'drizzle-orm/pg-core';
import { DEBRIEF_ATTEMPT_FORMAT } from '#/lib/debrief-attempt-snapshot';
import { KNOWLEDGE_CHUNKS_STATEMENTS } from '../migrate-knowledge-chunks';
import { lessonTestResultsTable } from '../schema';

const sqls = () =>
  KNOWLEDGE_CHUNKS_STATEMENTS.map((s) => new PgDialect().sqlToQuery(s).sql);

describe('migrate-knowledge-chunks', () => {
  it('every create / alter is re-runnable and nothing is destructive', () => {
    for (const s of sqls()) {
      if (/^\s*(create|alter)/i.test(s)) expect(s).toMatch(/if not exists/i);
      expect(s).not.toMatch(/\b(drop|truncate)\b|\bdelete\s+from\b/i);
    }
  });

  it('creates the four new tables', () => {
    const all = sqls().join('\n');
    for (const t of [
      'lesson_knowledge_chunks',
      'debrief_chunk_mastery',
      'debrief_passes',
      'debrief_answer_logs',
    ]) {
      expect(all).toMatch(new RegExp(`create table if not exists "${t}"`, 'i'));
    }
  });

  it('keeps previous_mapping on lesson_knowledge_chunks', () => {
    expect(sqls().join('\n')).toMatch(/"previous_mapping" jsonb/i);
  });

  it('adds the new attempt columns to lesson_test_results', () => {
    const all = sqls().join('\n');
    for (const c of ['format', 'chunk_version', 'draft', 'finished_reason']) {
      expect(all).toMatch(
        new RegExp(
          `alter table "lesson_test_results" add column if not exists "${c}"`,
          'i',
        ),
      );
    }
  });

  it('allows at most one open chunk-format attempt per pilot and lesson, after the format column exists', () => {
    const all = sqls();
    const idx = all.findIndex((s) =>
      /lesson_test_results_one_open_attempt_idx/i.test(s),
    );
    expect(all[idx]).toBe(
      `create unique index if not exists "lesson_test_results_one_open_attempt_idx" on "lesson_test_results" ("user_id","lesson_slug") where "completed_at" is null and "format" = '${DEBRIEF_ATTEMPT_FORMAT}'`,
    );
    const formatCol = all.findIndex((s) =>
      /add column if not exists "format"/i.test(s),
    );
    expect(idx).toBeGreaterThan(formatCol);
  });

  it('the schema mirrors the same predicate, with the same format constant', () => {
    const idx = getTableConfig(lessonTestResultsTable).indexes.find(
      (i) => i.config.name === 'lesson_test_results_one_open_attempt_idx',
    );
    expect(idx?.config.unique).toBe(true);
    const where = idx?.config.where;
    expect(where && new PgDialect().sqlToQuery(where).sql).toBe(
      `"lesson_test_results"."completed_at" is null and "lesson_test_results"."format" = '${DEBRIEF_ATTEMPT_FORMAT}'`,
    );
  });

  it('backfills legacy passes from completed attempts scoring >= 75, idempotently', () => {
    const backfill = sqls().find((s) =>
      /insert into "debrief_passes"/i.test(s),
    );
    expect(backfill).toBeDefined();
    expect(backfill).toMatch(/"total_score"\s*>=\s*75/i);
    expect(backfill).toMatch(/"completed_at" is not null/i);
    expect(backfill).toMatch(/on conflict do nothing/i);
  });
});
