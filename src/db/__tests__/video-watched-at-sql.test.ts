// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';
import {
  videoRewatchedAtSql,
  videoWatchedAtSql,
} from '#/db/progress-components';
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

/**
 * A below-par debrief on a video lesson reopens once the video is watched
 * AGAIN: every watched-milestone reached afresh after the latest below-par
 * attempt. Null with no such attempt (the comparison with a null max is
 * never true, so nothing counts).
 */
describe('videoRewatchedAtSql', () => {
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

  it('counts only milestones reached after the latest below-par attempt', () => {
    const frag = videoRewatchedAtSql('u1', lessonsTable.id, lessonsTable.slug);
    expect(squash(renderSql(frag))).toBe(
      squash(`(
        select case when count(*) = $1
          then max(f.first_at) at time zone 'UTC' end
        from (
          select min(v.created_at) as first_at from videos_progress v
          where v.user_id = $2
            and v.lesson_id = "lessons"."id"
            and v.progress in (10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95)
            and v.created_at > (
              select max(t.completed_at) from lesson_test_results t
              where t.user_id = $3
                and t.lesson_slug = "lessons"."slug"
                and t.completed_at is not null
                and t.total_score < $4
            )
          group by v.progress
        ) f
      )`),
    );
    expect(renderSqlParams(frag)).toEqual([18, 'u1', 'u1', 75]);
  });
});
