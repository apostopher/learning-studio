import { and, eq } from 'drizzle-orm';
import { db } from '#/db';
import { videoProgressTable } from '#/db/schema';

/**
 * We track the video progress in 5% increments. This way we can detect whether the user skipped to the end of the video.
 * We need to detect whether the user has watched at least 100% of the video. to unlock certain features.
 * Defined in src/lib/course-milestones.ts so client bundles don't pull in the db module.
 */
export { milestones } from '#/lib/course-milestones';

import { getDebriefAttempts } from '#/db/lesson-test';
import { isVideoWatched, milestones } from '#/lib/course-milestones';
import { type OwedRewatch, owedRewatch } from '#/lib/video-rewatch';

export type LessonProgress = {
  /** Distinct milestones the user has reached for this lesson, in order. */
  milestonesHit: number[];
  /** Whether the lesson counts as watched (every milestone except 100). */
  watched: boolean;
  /** A below-par debrief is owed a rewatch — see `owedRewatch`. */
  rewatch: OwedRewatch | null;
};

/**
 * Progress for a single (userId, lessonId) — the milestones reached and whether
 * the lesson is watched. Prefer this over the course-level rollup
 * (src/db/course-progress.ts) when you only care about one lesson.
 */
export async function getLessonProgress({
  userId,
  lessonId,
  lessonSlug,
}: {
  userId: string;
  lessonId: number;
  /** For the debrief attempts that decide whether a rewatch is owed. */
  lessonSlug: string;
}): Promise<LessonProgress> {
  const [rows, attempts] = await Promise.all([
    db
      .select({
        progress: videoProgressTable.progress,
        createdAt: videoProgressTable.createdAt,
      })
      .from(videoProgressTable)
      .where(
        and(
          eq(videoProgressTable.userId, userId),
          eq(videoProgressTable.lessonId, lessonId),
        ),
      ),
    getDebriefAttempts(userId, lessonSlug),
  ]);

  const reached = new Set<number>();
  for (const { progress } of rows) {
    if (milestones.includes(progress)) reached.add(progress);
  }
  return {
    milestonesHit: milestones.filter((m) => reached.has(m)),
    watched: isVideoWatched(reached),
    rewatch: owedRewatch(rows, attempts),
  };
}

/**
 * Append a lesson-progress milestone row for a user. Append-only by design —
 * repeated milestone hits power the watch-window / coverage detection used by
 * the completion checks above.
 */
export async function recordLessonProgress({
  userId,
  lessonId,
  progress,
}: {
  userId: string;
  lessonId: number;
  progress: number;
}): Promise<void> {
  await db.insert(videoProgressTable).values({ userId, lessonId, progress });
}
