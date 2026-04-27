import { db } from "@/db";
import { videoProgressTable } from "@/db/schema";
import { and, eq, asc, countDistinct, inArray } from "drizzle-orm";

type ProgressEvent = {
  progress: number; // milestone reached, e.g. 10, 15, ..., 100
  createdAt: Date | string | number; // DB date or ISO string or epoch
};

export type WatchWindow = { startedAt: number; finishedAt: number };

/**
 * Given progress events for a single (userId, videoId), find each "watch":
 * the minimal time window during which all milestones were reached at least once.
 *
 * - Order of milestones doesn't matter.
 * - Windows can span multiple days/sessions.
 * - After a watch completes, the next event starts a fresh window.
 */
function computeWatches(
  events: ProgressEvent[],
  milestones: number[],
): WatchWindow[] {
  if (!events?.length) return [];

  // Unique milestones we care about
  const required = new Set(milestones);

  // Normalize + filter to only relevant milestone hits
  const normalized = events
    .map((e) => ({
      progress: e.progress,
      ts:
        typeof e.createdAt === "number"
          ? e.createdAt
          : new Date(e.createdAt).getTime(),
    }))
    .filter((e) => Number.isFinite(e.ts) && required.has(e.progress));

  if (normalized.length === 0) return [];

  // Sort by time; stabilize by progress for deterministic tie-breaking
  normalized.sort((a, b) => a.ts - b.ts || a.progress - b.progress);

  const watches: WatchWindow[] = [];
  const seen = new Set<number>();
  let startedAt: number | null = null;

  for (const evt of normalized) {
    if (startedAt === null) startedAt = evt.ts; // start a new window on first relevant event
    seen.add(evt.progress);

    if (seen.size === required.size) {
      // Completed a full coverage
      watches.push({ startedAt, finishedAt: evt.ts });
      // Reset for the next potential watch
      seen.clear();
      startedAt = null;
    }
  }

  return watches.sort((a, b) => a.finishedAt - b.finishedAt);
}

/**
 * We track the video progress in 5% increments. This way we can detect whether the user skipped to the end of the video.
 * We need to detect whether the user has watched at least 100% of the video. to unlock certain features.
 * Defined in src/lib/course-milestones.ts so client bundles don't pull in the db module.
 */
export { milestones } from "#/lib/course-milestones";
import { milestones } from "#/lib/course-milestones";

/**
 * Get video progress for a user across all videos they have watched.
 * Returns a map of videoId to Set of milestones hit, and a map of videoId
 * to completed WatchWindows. Single-pass over rows returned in createdAt ASC
 * order (covered by videos_progress_user_created_idx).
 */
export async function getUserVideoProgress({ userId }: { userId: string }) {
  const progressRows = await db
    .select({
      videoId: videoProgressTable.videoId,
      progress: videoProgressTable.progress,
      createdAt: videoProgressTable.createdAt,
    })
    .from(videoProgressTable)
    .where(eq(videoProgressTable.userId, userId))
    .orderBy(asc(videoProgressTable.createdAt));

  const required = new Set(milestones);
  const requiredSize = required.size;

  const progressByVideo: Record<string, Set<number>> = {};
  const watchHistory: Record<string, WatchWindow[]> = {};
  // Per-video in-progress window state. Rows arrive globally sorted by
  // createdAt, so within each videoId they are also sorted — we can stream
  // windows without a per-video sort.
  const windowState: Record<
    string,
    { seen: Set<number>; startedAt: number | null }
  > = {};

  for (const { videoId, progress, createdAt } of progressRows) {
    let hits = progressByVideo[videoId];
    if (!hits) {
      hits = progressByVideo[videoId] = new Set();
      watchHistory[videoId] = [];
      windowState[videoId] = { seen: new Set(), startedAt: null };
    }
    hits.add(progress);

    if (!required.has(progress)) continue;

    const state = windowState[videoId];
    const ts = createdAt.getTime();
    if (state.startedAt === null) state.startedAt = ts;
    state.seen.add(progress);

    if (state.seen.size === requiredSize) {
      watchHistory[videoId].push({
        startedAt: state.startedAt,
        finishedAt: ts,
      });
      state.seen.clear();
      state.startedAt = null;
    }
  }

  return { progressByVideo, watchHistory };
}

export type UserVideoProgress = Awaited<ReturnType<typeof getUserVideoProgress>>;

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
        inArray(videoProgressTable.progress, milestones),
      ),
    );
  return (row?.count ?? 0) === milestones.length;
}

export async function getVideoWatchHistory({
  userId,
  videoId,
}: {
  userId: string;
  videoId: string;
}) {
  const progressRows = await db
    .select({
      progress: videoProgressTable.progress,
      createdAt: videoProgressTable.createdAt,
    })
    .from(videoProgressTable)
    .where(
      and(
        eq(videoProgressTable.userId, userId),
        eq(videoProgressTable.videoId, videoId),
      ),
    )
    .orderBy(asc(videoProgressTable.createdAt));

  return computeWatches(progressRows, milestones);
}
