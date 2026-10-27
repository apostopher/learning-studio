import { getCourseProgress } from '#/db/course-progress';
import { recordLessonCompletions } from '#/db/lesson-completions';
import { maybePromote, type Promotion } from '#/lib/promotion.server';

/**
 * Record every newly-100% lesson in the course, then run the promotion check.
 *
 * Completion is sticky: this only ever inserts. A lesson that later falls
 * below 100% keeps its row, so the debrief clock never restarts.
 *
 * Both steps are best-effort and independent. The progress write that
 * triggered this has already succeeded, so a failure here must never fail the
 * request, and a failed recording must not skip the promotion check.
 * Recording runs first so promotion sees the settled state.
 */
export async function settleProgress(o: {
  userId: string;
  courseSlug: string;
}): Promise<Promotion | null> {
  try {
    const progress = await getCourseProgress({
      userId: o.userId,
      slug: o.courseSlug,
    });
    const newlyDone = progress.lessons
      .filter((l) => l.percent >= 100 && !l.done)
      .map((l) => l.lessonId);
    if (newlyDone.length > 0) {
      await recordLessonCompletions(o.userId, newlyDone);
    }
  } catch (error) {
    console.error('settleProgress: recording completions failed', error);
  }

  try {
    return await maybePromote({ userId: o.userId, courseSlug: o.courseSlug });
  } catch (error) {
    console.error('settleProgress: promotion check failed', error);
    return null;
  }
}
