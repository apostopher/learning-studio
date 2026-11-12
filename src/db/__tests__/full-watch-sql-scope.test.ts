// @vitest-environment node
import { eq } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  videoRewatchedAtSql,
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

  it('videoRewatchedAtSql ties both subqueries to the OUTER lesson', () => {
    const text = inSingleTableSelect(
      videoRewatchedAtSql('u1', lessonsTable.id, lessonsTable.slug),
    );
    expect(predicate(text, 'v.lesson_id')).toBe(
      'and v.lesson_id = "lessons"."id"',
    );
    expect(predicate(text, 't.lesson_slug')).toBe(
      'and t.lesson_slug = "lessons"."slug"',
    );
  });
});
