import { atom } from 'jotai';
import type { ProviderId } from '@/lib/admin-schemas';

/** Whether the create-course dialog is open. */
export const createCourseDialogOpenAtom = atom(false);

/** Whether the create-module dialog is open. */
export const createModuleDialogOpenAtom = atom(false);

/** Id of the module column currently being dragged, or null. */
export const activeDragModuleIdAtom = atom<number | null>(null);

/** Id of the lesson currently being dragged, or null. */
export const activeDragLessonIdAtom = atom<number | null>(null);

/** The lesson pending deletion (id + name), or null when closed. */
export const deleteLessonAtom = atom<{ id: number; name: string } | null>(null);

/** Id of the lesson whose configure modal is open, or null when closed. */
export const configureLessonIdAtom = atom<number | null>(null);

/** Module id whose create-lesson dialog is open, or null when closed. */
export const createLessonModuleIdAtom = atom<number | null>(null);

/** The module being edited (current field values), or null when closed. */
export const editModuleAtom = atom<{
  id: number;
  name: string;
  imageUrlAvif: string | null;
  imageUrlWebp: string | null;
} | null>(null);
/** The module pending deletion (id + name), or null when closed. */
export const deleteModuleAtom = atom<{ id: number; name: string } | null>(null);

/** The course being edited (current field values), or null when closed. */
export const editCourseAtom = atom<{
  id: number;
  name: string;
  description: string | null;
  imageUrlAvif: string | null;
  imageUrlWebp: string | null;
} | null>(null);
/** The course pending deletion (id + name), or null when closed. */
export const deleteCourseAtom = atom<{ id: number; name: string } | null>(null);

/**
 * Provider/ref detected from a video URL the admin just typed into the Video
 * tab but hasn't been confirmed by the board yet (the source of truth is the
 * lesson record once `useSetLessonVideo` succeeds and the board refetches).
 * Only one lesson-config modal is open at a time, so a single atom — not a
 * family — is enough. Reset when the modal switches lessons or the draft is
 * confirmed by the refetched board.
 */
export const videoDraftDetectionAtom = atom<{
  provider: ProviderId;
  ref: string;
} | null>(null);

/** Whether the Video tab is showing the "replace video URL" form over an already-configured video. */
export const videoReplaceModeAtom = atom(false);

/**
 * Which provider's credential form is expanded in the course edit dialog's
 * "Video integrations" section, or null when every row is collapsed. Reset
 * whenever the dialog is pointed at a different course.
 */
export const expandedVideoProviderAtom = atom<ProviderId | null>(null);
