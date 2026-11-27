// The EDITOR's narrower types, not `BoardLesson`/`BoardModule`. Every helper
// here reads only fields the two shapes share, and the org-level editor's
// board omits `videoProvider`/`videoRef` (`editorBoardLessonSchema`) — so
// asking for the wider type would have kept these helpers off that board for
// fields they never touch. A full `BoardLesson` still satisfies them.

import { SubscriptionSchema, type SubscriptionType } from '#/types';
import type { EditorBoardLesson, EditorBoardModule } from '@/lib/admin-schemas';

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

export const accessValue = (lesson: EditorBoardLesson): AccessValue =>
  lesson.requiredSubscriptions.length > 0 ? 'subscription' : 'free';

/**
 * Map an Access choice to the required_subscriptions array to persist.
 *
 * Paid takes the module's subscriptions, or every subscription when the
 * module has none. No screen sets a module's access, so every module is free,
 * and copying only the module's would write `[]` and leave paid unreachable
 * (2026-11-28: the card's PAID/FREE chip replaced the padlock that was stuck
 * on exactly that).
 */
export const accessSubscriptions = (
  next: AccessValue,
  module: Pick<EditorBoardModule, 'requiredSubscriptions'>,
): SubscriptionType[] => {
  if (next === 'free') return [];
  return module.requiredSubscriptions.length > 0
    ? [...module.requiredSubscriptions]
    : [...SubscriptionSchema.options];
};
