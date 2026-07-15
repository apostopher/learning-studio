import { atom } from 'jotai';

/** Whether the create-course dialog is open. */
export const createCourseDialogOpenAtom = atom(false);

/** Whether the create-module dialog is open. */
export const createModuleDialogOpenAtom = atom(false);

/** Id of the module column currently being dragged, or null. */
export const activeDragModuleIdAtom = atom<number | null>(null);

/** Module id whose create-lesson dialog is open, or null when closed. */
export const createLessonModuleIdAtom = atom<number | null>(null);
