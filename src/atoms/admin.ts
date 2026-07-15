import { atom } from 'jotai';

/** Whether the create-course dialog is open. */
export const createCourseDialogOpenAtom = atom(false);

/** Whether the create-module dialog is open. */
export const createModuleDialogOpenAtom = atom(false);

/** Id of the module column currently being dragged, or null. */
export const activeDragModuleIdAtom = atom<number | null>(null);

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
