import {
  getCourseDetailsWithCache,
  getCourseIdentityBySlug,
} from '#/db/course';
import { getCourseProgress } from '#/db/course-progress';
import { getCurrentLevel, insertEarnedLevelRow } from '#/db/user-levels';
import { getUserEmail } from '#/db/user-profile';
import { sendLevelPromotionEmail } from '#/lib/email/send-level-promotion-email';
import { isTierComplete, nextLevel } from '#/lib/tier-completion';
import type { UserLevel } from '#/types';

export type Promotion = { id: number; from: UserLevel; to: UserLevel };

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

  // Nothing in this course is tagged, so there are no tiers to complete.
  //
  // Without this guard the untagged catalogue promotes the entire user base to
  // `advanced` on deploy day: `isLessonVisibleAtLevel([], level)` is true for
  // EVERY tier, so any pilot already at 100% satisfies `isTierComplete('basic')`
  // on their next progress write (promoted, emailed), then
  // `isTierComplete('intermediate')` on the write after (promoted, emailed
  // again). The rows are append-only and the emails are real, and the first
  // lesson an author later tags `['basic']` would then be invisible to
  // everyone — correctable only one pilot at a time.
  //
  // This is what makes the spec's own rollout property true: the catalogue
  // stays fully visible on deploy and the feature switches on lesson by lesson
  // as authors tag content.
  if (!lessons.some((lesson) => lesson.levels.length > 0)) return null;

  if (!isTierComplete({ lessons, progress: progress.lessons, level: from })) {
    return null;
  }

  // Conditional, not a plain insert: this function runs after EVERY progress
  // write, and the video beacon fires repeatedly through a lesson — two
  // overlapping requests both read `from = 'basic'`, both pass the check
  // above, and without this both would append a row and send an email. A null
  // means somebody else got there first, so there is nothing new to announce.
  const id = await insertEarnedLevelRow({
    userId: options.userId,
    courseId,
    level: to,
  });
  if (id === null) return null;

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

  return { id, from, to };
}
