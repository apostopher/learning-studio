import { and, asc, countDistinct, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  coursesTable,
  lessonsTable,
  modulesTable,
  videoProgressTable,
} from "@/db/schema";
import { watchedMilestones } from "#/lib/course-milestones";
import {
  aggregateCourseProgress,
  type CourseProgress,
} from "#/lib/course-progress-agg";

/**
 * Efficient course-scoped progress for one user. A single grouped query counts
 * the distinct watched-milestones (10..95) hit per lesson video in Postgres —
 * the join runs off the (user_id, video_id) index and only watched-milestone
 * rows are joined, so it never pulls raw progress events to the app. The result
 * is one row per lesson (plus a lessonId:null row per empty module), which
 * aggregateCourseProgress rolls up to lesson / module / course.
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
    })
    .from(coursesTable)
    .innerJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))
    .leftJoin(lessonsTable, eq(lessonsTable.moduleId, modulesTable.id))
    .leftJoin(
      videoProgressTable,
      and(
        eq(videoProgressTable.userId, userId),
        // lessons.video_id is a uuid; videos_progress.video_id is the same value
        // stored as text — cast to join.
        eq(videoProgressTable.videoId, sql`${lessonsTable.videoId}::text`),
        inArray(videoProgressTable.progress, watchedMilestones),
      ),
    )
    .where(eq(coursesTable.slug, slug))
    .groupBy(
      modulesTable.id,
      modulesTable.rank,
      lessonsTable.id,
      lessonsTable.rank,
    )
    .orderBy(asc(modulesTable.rank), asc(lessonsTable.rank));

  return aggregateCourseProgress(
    slug,
    rows.map((r) => ({
      moduleId: r.moduleId,
      lessonId: r.lessonId,
      watchedHits: Number(r.watchedHits),
    })),
  );
}
