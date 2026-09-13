import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { LessonRef } from '#/lib/lesson-ref';
import { saveJson } from './save-json';

/**
 * Both slugs: the route refuses a body without `courseSlug`, and the pointer
 * it writes is per course — a lesson placed in two courses moves two
 * different pointers.
 */
export type RecordLastViewedInput = LessonRef;

/**
 * Move the learner's resume pointer to a lesson.
 *
 * Fire-and-forget, following useReportVideoProgress: it goes out via
 * `sendBeacon` so it survives the learner navigating straight on, and there is
 * no cache to invalidate — the pointer is read once, server-side, in the
 * course index's `beforeLoad`, never by a live query. A dropped write leaves
 * the previous pointer in place, so the worst case is resuming one lesson
 * behind, self-correcting on the next visit.
 */
export function useRecordLastViewed() {
  return useMutation({
    mutationFn: (input: RecordLastViewedInput) =>
      saveJson({
        url: '/api/user/last-viewed',
        method: 'POST',
        body: input,
        fireAndForget: true,
      }),
  });
}

/**
 * The slug to write, or null to write nothing — the whole decision behind
 * useRecordLastViewedLesson, extracted so it can be tested without
 * `renderHook` (which this repo's Vite pipeline breaks for any hook calling a
 * raw React hook; see use-push-to-talk.test.ts).
 *
 * `recorded` is what was last written during this component's life.
 */
export function nextLastViewedWrite({
  recorded,
  lessonSlug,
  enabled,
}: {
  recorded: string | null;
  lessonSlug: string;
  enabled: boolean;
}): string | null {
  // A locked or still-loading lesson must never move the pointer.
  if (!enabled) return null;
  // Already recorded this lesson — re-renders while sitting on it (video
  // state changing, material arriving) must not re-fire the write.
  if (recorded === lessonSlug) return null;
  return lessonSlug;
}

/**
 * Record `lessonSlug` as the learner's resume point, once, when `enabled`.
 *
 * `enabled` must be the result of shouldRecordLastViewed — the pointer means
 * "the last lesson I could actually see". Note that `enabled` is false on the
 * FIRST render of every lesson view (computeLessonMainState holds at
 * 'course-loading' until both queries settle), so this deliberately reacts to
 * `enabled` flipping true, rather than only firing on mount.
 */
export function useRecordLastViewedLesson({
  courseSlug,
  lessonSlug,
  enabled,
}: LessonRef & { enabled: boolean }) {
  const { mutate } = useRecordLastViewed();
  const recordedRef = useRef<LessonRef | null>(null);

  useEffect(() => {
    // "Already recorded" is per course: the same lesson opened in another
    // course is a different pointer, so nothing counts as recorded there yet.
    const recorded =
      recordedRef.current?.courseSlug === courseSlug
        ? recordedRef.current.lessonSlug
        : null;
    const next = nextLastViewedWrite({ recorded, lessonSlug, enabled });
    if (next == null) return;
    recordedRef.current = { courseSlug, lessonSlug: next };
    mutate({ courseSlug, lessonSlug: next });
  }, [enabled, courseSlug, lessonSlug, mutate]);
}
