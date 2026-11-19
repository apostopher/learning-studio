import { atom } from 'jotai';
import { atomFamily } from 'jotai-family';

/**
 * Whether a course's pass-mark popover is open, keyed by course id so opening
 * one card's editor never carries into another's (same reasoning as
 * `courseStaffDialogOpenAtomFamily`).
 */
export const coursePassMarkOpenAtomFamily = atomFamily((_courseId: number) =>
  atom(false),
);
