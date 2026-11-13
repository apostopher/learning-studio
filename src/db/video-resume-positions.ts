import { and, eq, sql } from 'drizzle-orm';
import { db } from '#/db';
import { videoResumePositionsTable } from '#/db/schema';

/** Where a learner last left a video, and how long that video was then. */
export type ResumePosition = { seconds: number; duration: number };

export async function getResumePosition({
  userId,
  lessonId,
}: {
  userId: string;
  lessonId: number;
}): Promise<ResumePosition | null> {
  const [row] = await db
    .select({
      seconds: videoResumePositionsTable.positionSeconds,
      duration: videoResumePositionsTable.durationSeconds,
    })
    .from(videoResumePositionsTable)
    .where(
      and(
        eq(videoResumePositionsTable.userId, userId),
        eq(videoResumePositionsTable.lessonId, lessonId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Overwrites the learner's position: the latest watch always wins. */
export async function saveResumePosition({
  userId,
  lessonId,
  seconds,
  duration,
}: {
  userId: string;
  lessonId: number;
} & ResumePosition): Promise<void> {
  await db
    .insert(videoResumePositionsTable)
    .values({
      userId,
      lessonId,
      positionSeconds: seconds,
      durationSeconds: duration,
    })
    .onConflictDoUpdate({
      target: [
        videoResumePositionsTable.userId,
        videoResumePositionsTable.lessonId,
      ],
      set: {
        positionSeconds: seconds,
        durationSeconds: duration,
        updatedAt: sql`now()`,
      },
    });
}
