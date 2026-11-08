// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
import { videoWatchedAtSql } from '#/db/progress-components';
import { lessonsTable } from '#/db/schema';

/**
 * The debrief clock starts at this instant. Its semantics live in SQL, so the
 * SQL itself is pinned: the moment the LAST of the 18 watched-milestones
 * (10..95) was FIRST reached, and nothing until all 18 have been.
 */
describe('videoWatchedAtSql', () => {
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

  it('takes the latest first-hit across all 18 watched-milestones, only once all are hit', () => {
    const frag = videoWatchedAtSql('u1', lessonsTable.id);
    expect(squash(renderSql(frag))).toBe(
      squash(`(
        select case when count(*) = $1
          then max(f.first_at) at time zone 'UTC' end
        from (
          select min(v.created_at) as first_at from videos_progress v
          where v.user_id = $2
            and v.lesson_id = "lessons"."id"
            and v.progress in (10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95)
          group by v.progress
        ) f
      )`),
    );
    expect(renderSqlParams(frag)).toEqual([18, 'u1']);
  });
});
