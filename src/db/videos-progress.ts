import { db } from "@/db";
import { videoProgressTable } from "@/db/schema";
import { and, countDistinct, eq, inArray } from "drizzle-orm";

/**
 * We track the video progress in 5% increments. This way we can detect whether the user skipped to the end of the video.
 * We need to detect whether the user has watched at least 100% of the video. to unlock certain features.
 * Defined in src/lib/course-milestones.ts so client bundles don't pull in the db module.
 */
export { milestones } from "#/lib/course-milestones";
import {
  isVideoWatched,
  milestones,
  watchedMilestones,
} from "#/lib/course-milestones";

/**
 * Whether a single user has watched a single video. "Watched" tolerates
 * stopping a few seconds before the end — it requires every milestone except
 * the final 100 (see watchedMilestones), still guarding against skipping.
 */
export async function hasWatchedVideo({
  videoId,
  userId,
}: {
  videoId: string;
  userId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ count: countDistinct(videoProgressTable.progress) })
    .from(videoProgressTable)
    .where(
      and(
        eq(videoProgressTable.userId, userId),
        eq(videoProgressTable.videoId, videoId),
        inArray(videoProgressTable.progress, watchedMilestones),
      ),
    );
  return (row?.count ?? 0) === watchedMilestones.length;
}

export type VideoProgress = {
  /** Distinct milestones the user has reached for this video, in order. */
  milestonesHit: number[];
  /** Whether the video counts as watched (every milestone except 100). */
  watched: boolean;
};

/**
 * Progress for a single (userId, videoId) — the milestones reached and whether
 * the video is watched. Prefer this over the course-level rollup
 * (src/db/course-progress.ts) when you only care about one video.
 */
export async function getVideoProgress({
  userId,
  videoId,
}: {
  userId: string;
  videoId: string;
}): Promise<VideoProgress> {
  const rows = await db
    .select({ progress: videoProgressTable.progress })
    .from(videoProgressTable)
    .where(
      and(
        eq(videoProgressTable.userId, userId),
        eq(videoProgressTable.videoId, videoId),
      ),
    );

  const reached = new Set<number>();
  for (const { progress } of rows) {
    if (milestones.includes(progress)) reached.add(progress);
  }
  return {
    milestonesHit: milestones.filter((m) => reached.has(m)),
    watched: isVideoWatched(reached),
  };
}

/**
 * Append a video-progress milestone row for a user. Append-only by design —
 * repeated milestone hits power the watch-window / coverage detection used by
 * the completion checks above.
 */
export async function recordVideoProgress({
  userId,
  videoId,
  progress,
}: {
  userId: string;
  videoId: string;
  progress: number;
}): Promise<void> {
  await db.insert(videoProgressTable).values({ userId, videoId, progress });
}
