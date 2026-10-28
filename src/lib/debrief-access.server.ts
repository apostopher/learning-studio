import { getCourseDetailsWithCache } from '#/db/course';
import { getDebriefFacts } from '#/db/lesson-test';
import { computeDebriefState, type DebriefState } from '#/lib/debrief-schedule';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';

export type DebriefAccess =
  | { ok: true; courseId: number; lessonId: number; state: DebriefState }
  | { ok: false; status: 403 | 404 };

/**
 * Gate + level + hasDebrief + facts → state. The single server authority on
 * "may this pilot take/see this debrief now". `generate`, `save-results` and
 * `prepare` all ask here, so they cannot disagree about it.
 *
 * Refusals:
 * - 403 for an unknown lesson, a non-subscriber, a prerequisite-locked lesson,
 *   and an out-of-tier lesson in BOTH read-only states (spec call 12: no
 *   debrief clock there, so no D the pilot cannot clear). One opaque status
 *   for all of them, as in the other lesson routes, so this is not an
 *   enumeration oracle for lesson slugs.
 * - 404 for a lesson whose debrief is switched off (`has_debrief`), asked
 *   only after the gate has passed.
 *
 * Not refused on the material lock: preparation runs while the video plays
 * (`video-locked`), and a lesson cannot be done — so the debrief cannot be
 * open — before its video is watched.
 *
 * Admins and course staff get every LOCK bypassed by `evaluateLessonGate`, but
 * not the schedule: there is no author preview of debriefs, so their own
 * `doneAt` and attempts decide the state like anyone else's.
 */
export async function getDebriefAccess({
  userId,
  lessonSlug,
  courseSlug,
  now,
}: {
  userId: string;
  lessonSlug: string;
  courseSlug: string;
  now: Date;
}): Promise<DebriefAccess> {
  const gate = await evaluateLessonGate({ userId, lessonSlug, courseSlug });
  if (
    !gate ||
    !gate.subscribed ||
    gate.outOfTier ||
    gate.lessonLock.kind !== 'open'
  ) {
    return { ok: false, status: 403 };
  }

  // Already cached: the gate just read the same payload.
  const details = await getCourseDetailsWithCache(courseSlug);
  const lesson = details?.modules
    .flatMap((mod) => mod.lessons)
    .find((l) => l.slug === lessonSlug);
  if (!lesson?.hasDebrief) return { ok: false, status: 404 };

  const facts = await getDebriefFacts(userId, lessonSlug, lesson.id);
  return {
    ok: true,
    courseId: gate.courseId,
    lessonId: lesson.id,
    state: computeDebriefState(facts, now),
  };
}
