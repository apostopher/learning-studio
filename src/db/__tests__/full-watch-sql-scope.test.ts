// @vitest-environment node
import { eq } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
import {
  debriefFactColumns,
  progressComponentColumns,
  videoWatchedAtSql,
} from '#/db/progress-components';
import { lessonsTable } from '#/db/schema';

/**
 * `getDebriefFacts` selects these fragments from `lessons` ALONE, and in a
 * single-table select drizzle renders a column bare: `"id"`. Inside the
 * fragment's subquery over `videos_progress v`, Postgres binds a bare "id" to
 * the NEAREST scope — `v.id` — so `v.lesson_id = "id"` matched no watch and
 * every video lesson's debrief stayed locked (prod, 2026-11-12: a pilot with
 * all 18 milestones of RPASGEN04 read "Debrief locked"). The lesson reference
 * must name its table.
 */
const inSingleTableSelect = (fragment: ReturnType<typeof videoWatchedAtSql>) =>
  new QueryBuilder()
    .select({ at: fragment })
    .from(lessonsTable)
    .where(eq(lessonsTable.id, 97))
    .toSQL().sql;

const predicate = (sqlText: string, column: string) =>
  sqlText.match(new RegExp(`and ${column} = [^\\n]+`))?.[0].trim();

describe('full-watch SQL in a single-table select', () => {
  it('videoWatchedAtSql ties videos_progress to the OUTER lesson', () => {
    const text = inSingleTableSelect(videoWatchedAtSql('u1', lessonsTable.id));
    expect(predicate(text, 'v.lesson_id')).toBe(
      'and v.lesson_id = "lessons"."id"',
    );
  });
});

/**
 * The debrief fact columns are selected from `lessons` alone by
 * `getDebriefFacts` too, where the same bare-column binding bug applies: each
 * must name `"lessons"."id"` / `"lessons"."slug"`. Pinned as full strings.
 */
describe('debrief fact columns in a single-table select', () => {
  const squash = (t: string) => t.replace(/\s+/g, ' ').trim();
  const cols = debriefFactColumns('u1');

  it('debriefPassed ties debrief_passes to the OUTER lesson slug', () => {
    expect(squash(renderSql(cols.debriefPassed))).toBe(
      squash(`exists (
        select 1 from debrief_passes p
        where p.user_id = $1
          and p.lesson_slug = "lessons"."slug"
      )`),
    );
  });

  it('lastFinishedDebriefAt takes the latest completed attempt of ANY format', () => {
    expect(squash(renderSql(cols.lastFinishedDebriefAt))).toBe(
      squash(`(
        select max(t.completed_at) at time zone 'UTC' from lesson_test_results t
        where t.user_id = $1
          and t.lesson_slug = "lessons"."slug"
          and t.completed_at is not null
      )`),
    );
  });

  it('hasOpenDebrief looks for an unfinished chunk-format row of the OUTER lesson', () => {
    expect(squash(renderSql(cols.hasOpenDebrief))).toBe(
      squash(`exists (
        select 1 from lesson_test_results t
        where t.user_id = $1
          and t.lesson_slug = "lessons"."slug"
          and t.completed_at is null
          and t.format = $2
      )`),
    );
    expect(renderSqlParams(cols.hasOpenDebrief)).toEqual([
      'u1',
      'knowledge-chunks-v1',
    ]);
  });

  it('chunksCleared counts cleared rows of the CURRENT version for the OUTER lesson', () => {
    expect(squash(renderSql(cols.chunksCleared))).toBe(
      squash(`coalesce((
        select count(*)::int from debrief_chunk_mastery m
        join lesson_knowledge_chunks k on k.lesson_id = m.lesson_id
        where m.user_id = $1
          and m.lesson_id = "lessons"."id"
          and m.cleared_at is not null
          and m.chunk_id like 'v' || k.version || '-%'
      ), 0)`),
    );
  });

  it('chunksTotal is the stored list length of the OUTER lesson', () => {
    expect(squash(renderSql(cols.chunksTotal))).toBe(
      squash(`(
        select jsonb_array_length(k.chunks) from lesson_knowledge_chunks k
        where k.lesson_id = "lessons"."id"
      )`),
    );
  });

  it('the rollup selects the very same fragments (one rule, two readers)', () => {
    const rollup = progressComponentColumns('u1');
    for (const key of Object.keys(cols) as (keyof typeof cols)[]) {
      expect(renderSql(rollup[key])).toBe(renderSql(cols[key]));
      expect(renderSqlParams(rollup[key])).toEqual(renderSqlParams(cols[key]));
    }
  });

  it('debriefBearing also counts stored chunks, and names its outer slug in every subquery', () => {
    const text = squash(
      renderSql(progressComponentColumns('u1').debriefBearing),
    );
    expect(text).toContain(
      'exists ( select 1 from lesson_knowledge_chunks k where k.lesson_id = "lessons"."id" )',
    );
    expect(text).toContain('m.lesson_slug = "lessons"."slug"');
    expect(text).toContain('p.lesson_slug = "lessons"."slug"');
    expect(text).toContain('t.lesson_slug = "lessons"."slug"');
  });
});
