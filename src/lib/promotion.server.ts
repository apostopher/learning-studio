import {
  getCourseDetailsWithCache,
  getCourseIdentityBySlug,
} from '#/db/course';
import { getCourseProgress } from '#/db/course-progress';
import { getCurrentLevel, insertLevelRow } from '#/db/user-levels';
import { getUserEmail } from '#/db/user-profile';
import { sendLevelPromotionEmail } from '#/lib/email/send-level-promotion-email';
import { isTierComplete, nextLevel } from '#/lib/tier-completion';
import type { UserLevel } from '#/types';

export type Promotion = { from: UserLevel; to: UserLevel };

/**
 * Promote the pilot if they have just finished their tier.
 *
 * Called after every progress write, because there is no single "lesson
 * completed" event — completion emerges from section taps, video milestones,
 * quiz submissions and debrief saves independently.
 *
 * Only ever writes upward. Recomputation that could write downward was
 * rejected: one new Basic lesson would demote every Advanced pilot at once and,
 * under exact-match visibility, empty their course.
 *
 * Returns the promotion so the calling route can put it in its response and
 * the UI can show the moment in-flow rather than the pilot discovering a
 * rearranged course on their next visit.
 */
export async function maybePromote(options: {
  userId: string;
  courseSlug: string;
}): Promise<Promotion | null> {
  const identity = await getCourseIdentityBySlug(options.courseSlug);
  if (!identity) return null;
  const { id: courseId, name: courseName } = identity;

  const from = await getCurrentLevel(options.userId, courseId);
  const to = nextLevel(from);
  // Top of the ladder: skip the progress query entirely. This is what keeps
  // the check affordable on high-frequency video-milestone pings.
  if (to === null) return null;

  const [details, progress] = await Promise.all([
    getCourseDetailsWithCache(options.courseSlug),
    getCourseProgress({ userId: options.userId, slug: options.courseSlug }),
  ]);
  if (!details) return null;

  const lessons = details.modules.flatMap((mod) =>
    mod.lessons.map((lesson) => ({
      lessonId: lesson.id,
      levels: lesson.levels ?? [],
      isAvailable: lesson.isAvailable,
    })),
  );

  if (!isTierComplete({ lessons, progress: progress.lessons, level: from })) {
    return null;
  }

  await insertLevelRow({
    userId: options.userId,
    courseId,
    level: to,
    source: 'earned',
  });

  // Best-effort. The promotion is already durable; a mail outage must not
  // undo it or hide it from the response.
  try {
    const email = await getUserEmail(options.userId);
    if (email) {
      await sendLevelPromotionEmail({
        email,
        courseName,
        level: to,
      });
    }
  } catch (error) {
    console.error('Promotion email failed; the promotion stands.', error);
  }

  return { from, to };
}
