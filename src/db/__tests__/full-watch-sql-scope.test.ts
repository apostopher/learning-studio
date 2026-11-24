// @vitest-environment node
import { eq, type SQL } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
import {
  debriefFactColumns,
  progressComponentColumns,
  progressComponentGroupBy,
  videoWatchedAtSql,
} from '#/db/progress-components';
import {
  courseLessonVersionsTable,
  lessonsTable,
  lessonVersionsTable,
} from '#/db/schema';

/**
 * `getDebriefFacts` selected these fragments from `lessons` ALONE, and in a
 * single-table select drizzle renders a column bare: `"id"`. Inside the
 * fragment's subquery over `videos_progress v`, Postgres binds a bare "id" to
 * the NEAREST scope — `v.id` — so `v.lesson_id = "id"` matched no watch and
 * every video lesson's debrief stayed locked (prod, 2026-11-12: a pilot with
 * all 18 milestones of RPASGEN04 read "Debrief locked"). The lesson reference
 * must name its table.
 */
const inSingleTableSelect = (fragment: SQL) =>
  new QueryBuilder()
    .select({ at: fragment })
    .from(lessonsTable)
    .where(eq(lessonsTable.id, 97))
    .toSQL().sql;

const predicate = (sqlText: string, column: string) =>
  sqlText.match(new RegExp(`${column} = [^\\n]+`))?.[0].trim();

describe('full-watch SQL in a single-table select', () => {
  it('videoWatchedAtSql ties videos_progress to the OUTER lesson', () => {
    const text = inSingleTableSelect(videoWatchedAtSql('u1', lessonsTable.id));
    expect(predicate(text, 'v.lesson_id')).toBe('v.lesson_id = "lessons"."id"');
  });
});

/**
 * The debrief fact columns must name their outer tables too, whatever select
 * they are put in: the same bare-column binding bug applies. Each fragment goes through `inSingleTableSelect` (a bare `renderSql` qualifies
 * columns anyway and would hide the bug) and its outer predicate is pinned.
 */
describe('debrief fact columns in a single-table select', () => {
  const cols = debriefFactColumns('u1');

  it('debriefPassed ties debrief_passes to the OUTER lesson slug', () => {
    expect(
      predicate(inSingleTableSelect(cols.debriefPassed), 'p.lesson_slug'),
    ).toBe('p.lesson_slug = "lessons"."slug"');
  });

  it('lastFinishedDebriefAt ties lesson_test_results to the OUTER lesson slug', () => {
    expect(
      predicate(
        inSingleTableSelect(cols.lastFinishedDebriefAt),
        't.lesson_slug',
      ),
    ).toBe('t.lesson_slug = "lessons"."slug"');
  });

  it('hasOpenDebrief ties lesson_test_results to the OUTER lesson slug', () => {
    expect(
      predicate(inSingleTableSelect(cols.hasOpenDebrief), 't.lesson_slug'),
    ).toBe('t.lesson_slug = "lessons"."slug"');
  });

  it('chunksCleared ties the chunk list to the OUTER snapshot', () => {
    expect(
      predicate(inSingleTableSelect(cols.chunksCleared), 'k.lesson_version_id'),
    ).toBe('k.lesson_version_id = "lesson_versions"."id"');
  });

  it('chunksTotal ties the chunk row to the OUTER snapshot', () => {
    expect(
      predicate(inSingleTableSelect(cols.chunksTotal), 'k.lesson_version_id'),
    ).toBe('k.lesson_version_id = "lesson_versions"."id"');
  });

  it('debriefBearing ties every subquery to the OUTER lesson, course or snapshot', () => {
    const text = inSingleTableSelect(
      progressComponentColumns('u1').debriefBearing,
    );
    expect(predicate(text, 'p.course_id')).toBe(
      'p.course_id = "course_lesson_versions"."course_id"',
    );
    expect(predicate(text, 'p.lesson_slug')).toBe(
      'p.lesson_slug = "lessons"."slug"',
    );
    expect(predicate(text, 't.lesson_slug')).toBe(
      't.lesson_slug = "lessons"."slug"',
    );
    expect(predicate(text, 'k.lesson_version_id')).toBe(
      'k.lesson_version_id = "lesson_versions"."id"',
    );
  });

  it('hasOpenDebrief filters on the chunk-format tag', () => {
    expect(renderSqlParams(cols.hasOpenDebrief)).toEqual([
      'u1',
      'knowledge-chunks-v1',
    ]);
  });

  it('the rollup selects the very same fragments (one rule, two readers)', () => {
    const rollup = progressComponentColumns('u1');
    for (const key of Object.keys(cols) as (keyof typeof cols)[]) {
      expect(renderSql(rollup[key])).toBe(renderSql(cols[key]));
      expect(renderSqlParams(rollup[key])).toEqual(renderSqlParams(cols[key]));
    }
  });
});

// The rest of the snapshot's columns hang off its primary key; the two queries
// run for real in lesson-version-progress.test.ts.
it('the shared GROUP BY names the snapshot and the course that pins it', () => {
  expect(progressComponentGroupBy).toEqual([
    lessonsTable.slug,
    lessonsTable.needsVideoWatch,
    lessonsTable.hasDebrief,
    courseLessonVersionsTable.courseId,
    lessonVersionsTable.id,
    lessonVersionsTable.lessonId,
    lessonVersionsTable.videoProvider,
    lessonVersionsTable.videoRef,
  ]);
});
