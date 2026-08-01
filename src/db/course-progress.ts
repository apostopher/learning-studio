import { and, asc, countDistinct, eq, inArray } from 'drizzle-orm';
import {
  progressComponentColumns,
  progressComponentGroupBy,
  toComponentFields,
} from '#/db/progress-components';
import { watchedMilestones } from '#/lib/course-milestones';
import {
  aggregateCourseProgress,
  type CourseProgress,
} from '#/lib/course-progress-agg';
import { db } from '@/db';
import {
  coursesTable,
  lessonMaterialProgressTable,
  lessonsTable,
  modulesTable,
  videoProgressTable,
} from '@/db/schema';

/**
 * Efficient course-scoped progress for one user. A single grouped query counts
 * the distinct watched-milestones (10..95) hit per lesson video in Postgres —
 * the join runs off the (user_id, lesson_id) index (videos_progress_user_lesson_idx)
 * and only watched-milestone rows are joined, so it never pulls raw progress
 * events to the app. The result is one row per lesson (plus a lessonId:null
 * row per empty module), which aggregateCourseProgress rolls up to lesson /
 * module / course.
 *
 * Each row also carries the three facts that decide whether watching is the
 * measure at all — video presence, `needs_video_watch`, and whether the
 * learner has opened the page. A lesson with nothing to watch is scored on the
 * visit alone; see `lessonPercent`.
 *
 * Keep this in step with getMyCourses (src/db/course.ts), which feeds the same
 * aggregator from a different query for the /app cards. Change one without the
 * other and a course card disagrees with its own sidebar.
 */
export async function getCourseProgress({
  userId,
  slug,
}: {
  userId: string;
  slug: string;
}): Promise<CourseProgress> {
  const rows = await db
    .select({
      moduleId: modulesTable.id,
      lessonId: lessonsTable.id,
      watchedHits: countDistinct(videoProgressTable.progress),
      ...progressComponentColumns(userId),
    })
    .from(coursesTable)
    .innerJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))
    // WIP lessons are excluded in the JOIN, not the WHERE: a module whose
    // lessons are all unavailable must still yield its placeholder row, so it
    // keeps rendering its heading instead of vanishing from the result.
    .leftJoin(
      lessonsTable,
      and(
        eq(lessonsTable.moduleId, modulesTable.id),
        eq(lessonsTable.isAvailable, true),
      ),
    )
    .leftJoin(
      videoProgressTable,
      and(
        eq(videoProgressTable.userId, userId),
        eq(videoProgressTable.lessonId, lessonsTable.id),
        inArray(videoProgressTable.progress, watchedMilestones),
      ),
    )
    // Carries BOTH the 'page' visit row and the section-tap rows — the select
    // above splits them apart with FILTER rather than joining this table twice.
    // `completed` is tested everywhere, not row presence: the column defaults
    // to FALSE, so a row alone would not mean the learner was ever here.
    .leftJoin(
      lessonMaterialProgressTable,
      and(
        eq(lessonMaterialProgressTable.userId, userId),
        eq(lessonMaterialProgressTable.lessonSlug, lessonsTable.slug),
      ),
    )
    .where(eq(coursesTable.slug, slug))
    .groupBy(
      modulesTable.id,
      modulesTable.rank,
      lessonsTable.id,
      lessonsTable.rank,
      ...progressComponentGroupBy,
    )
    .orderBy(asc(modulesTable.rank), asc(lessonsTable.rank));

  return aggregateCourseProgress(
    slug,
    rows.map((r) => ({
      moduleId: r.moduleId,
      lessonId: r.lessonId,
      watchedHits: Number(r.watchedHits),
      ...toComponentFields(r),
    })),
  );
}
