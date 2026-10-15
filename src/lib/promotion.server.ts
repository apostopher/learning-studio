import {
  getCourseDetailsWithCache,
  getCourseIdentityBySlug,
} from '#/db/course';
import { getCourseProgress } from '#/db/course-progress';
import { getCurrentLevel, insertEarnedLevelRow } from '#/db/user-levels';
import { getUserEmail } from '#/db/user-profile';
import { sendLevelPromotionEmail } from '#/lib/email/send-level-promotion-email';
import { isTierComplete, nextLevel } from '#/lib/tier-completion';
import { isUserLevel, type UserLevel } from '#/types';

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
 * A pilot with no level is never promoted: there is no tier for them to have
 * finished.
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
  // No level, no rung to climb from: a pilot's first level is set by their
  // training team (or written at enrolment by `ensureEnrolmentLevel`), never
  // earned from progress — under strict levels they cannot see a lesson to
  // make progress on anyway.
  if (from === null) return null;
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

  // Nothing in this course is tagged with a real tier, so there are no tiers
  // to complete.
  //
  // Under strict levels `isTierComplete` already answers false here — no
  // lesson is visible at any tier, and an empty tier is never complete — so
  // this guard is now a second wall, not the only one. It stays because the
  // failure it prevents is unrecoverable: if a vacuous "every lesson at this
  // tier is done" ever answered true for an untagged course (as it did while
  // `[]` meant every tier), any pilot at 100% would be promoted to
  // intermediate on their next progress write and to advanced on the write
  // after — append-only rows and real emails each time. Keeping the rule
  // stated here, in the one function that writes promotions, means a future
  // change to the visibility predicate cannot silently reopen it. It also
  // skips the tier walk for the common untagged course.
  //
  // "Tagged" means a REAL tier. `'none'` hides a lesson from everyone; it is
  // not a tier, so a course whose only tags are `'none'` has no tiers either.
  if (!lessons.some((lesson) => lesson.levels.some(isUserLevel))) return null;

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
