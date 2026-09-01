// The EDITOR's narrower types, not `BoardLesson`/`BoardModule`. Every helper
// here reads only fields the two shapes share, and the org-level editor's
// board omits `videoProvider`/`videoRef` (`editorBoardLessonSchema`) — so
// asking for the wider type would have kept these helpers off that board for
// fields they never touch. A full `BoardLesson` still satisfies them.
import type { EditorBoardLesson, EditorBoardModule } from '@/lib/admin-schemas';
import type { SubscriptionType } from '@/types';

export type AvailabilityValue = 'public' | 'private';
export type AccessValue = 'free' | 'subscription';
export type DebriefValue = 'on' | 'off';
export type VideoWatchValue = 'required' | 'optional';

export const availabilityValue = (
  lesson: EditorBoardLesson,
): AvailabilityValue => (lesson.isAvailable ? 'public' : 'private');

export const debriefValue = (lesson: EditorBoardLesson): DebriefValue =>
  lesson.hasDebrief ? 'on' : 'off';

export const videoWatchValue = (lesson: EditorBoardLesson): VideoWatchValue =>
  lesson.needsVideoWatch ? 'required' : 'optional';

/**
 * Whether the "Required" choice should be disabled.
 *
 * True only when the lesson has no video AND is not already set to Required:
 * you may LEAVE an unsatisfiable state but not ENTER one. Disabling it
 * unconditionally would render the *selected* option greyed out — with
 * `aria-pressed="true"` on a disabled control — for the lessons that already
 * carry `needsVideoWatch: true` with no video (20 of them at the time of
 * writing, inherited from the course import).
 */
export const isVideoWatchRequiredDisabled = (
  lesson: EditorBoardLesson,
): boolean => !lesson.isConfigured && !lesson.needsVideoWatch;

/**
 * Why the Video watch row is restricted, or null when it is unremarkable.
 *
 * Two distinct cases, deliberately worded differently: one prevents a bad
 * setting, the other reports an existing one that cannot be satisfied.
 */
export const videoWatchWarning = (lesson: EditorBoardLesson): string | null => {
  if (lesson.isConfigured) return null;
  return lesson.needsVideoWatch
    ? 'This lesson has no video, so a required watch can never be satisfied. Add a video, or set this to Optional.'
    : 'This lesson has no video yet — add one before a watch can be required.';
};

/**
 * What turning Debrief on costs this lesson, or null when it costs nothing.
 *
 * `has_debrief` suppresses the Quiz tab outright — the learner is never shown
 * the authored quiz while it is on, whether or not a debrief can actually be
 * generated. That is deliberate (the flag stays authoritative so its meaning
 * does not depend on how complete the material happens to be), which makes
 * saying so here the only thing standing between an admin and silently hiding
 * content they wrote.
 *
 * Named with the count rather than a vague "this may hide the quiz": the
 * number is what makes it worth reading.
 */
export const debriefWarning = (lesson: EditorBoardLesson): string | null => {
  if (!lesson.hasDebrief) return null;
  if (lesson.quizQuestionCount === 0) return null;
  const q = lesson.quizQuestionCount;
  return `Debrief replaces the lesson quiz. This lesson's ${q} quiz ${
    q === 1 ? 'question is' : 'questions are'
  } hidden from learners while this is on.`;
};

export const accessValue = (lesson: EditorBoardLesson): AccessValue =>
  lesson.requiredSubscriptions.length > 0 ? 'subscription' : 'free';

/** A lesson can only inherit subscriptions if its module has any. */
export const isSubscriptionDisabled = (module: EditorBoardModule): boolean =>
  module.requiredSubscriptions.length === 0;

/** Map an Access choice to the required_subscriptions array to persist. */
export const accessSubscriptions = (
  next: AccessValue,
  module: EditorBoardModule,
): SubscriptionType[] =>
  next === 'subscription' ? [...module.requiredSubscriptions] : [];
