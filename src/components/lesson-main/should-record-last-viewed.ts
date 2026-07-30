import type { LessonMainState } from './types';

/**
 * Whether this render represents the learner actually seeing a lesson, and so
 * whether it should move their resume pointer.
 *
 * Only `ready` (player + material) and `no-video` (material only) qualify.
 * Everything else is deliberately excluded:
 *
 * - `locked` — a lock screen is a door you bounced off, not a place you were.
 *   Recording it would make the next visit resume onto that same door, and
 *   would let a learner poking at locked sidebar rows destroy their real
 *   resume point.
 * - `course-loading` / `course-error` / `material-error` — the lock state is
 *   unknown, and unknown must not be treated as unlocked. Same rule
 *   computeLessonMainState applies to rendering the player.
 * - `not-found` — there is no lesson to point at.
 */
export function shouldRecordLastViewed(state: LessonMainState): boolean {
  return state.kind === 'ready' || state.kind === 'no-video';
}
