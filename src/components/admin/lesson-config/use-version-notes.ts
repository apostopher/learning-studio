import { useAtom, useAtomValue } from 'jotai';
import {
  lessonVersionDraftAtomFamily,
  lessonVersionNotesDraftAtomFamily,
} from '#/atoms/admin';
import { useLessonVersionNotes } from '#/data-hooks/use-lesson-version-notes';
import { isVersionDirty, type VersionedLesson } from './use-version-gate';

export type VersionNotes = {
  /** What the field shows: the typed draft, else the saved notes. */
  value: string;
  /** Typed and different from what is saved for the version being edited. */
  isDirty: boolean;
  /** The saved notes are still loading, so the field has nothing to show. */
  isLoading: boolean;
  setDraft: (next: string | null) => void;
};

/**
 * What the notes start from: a version just typed has none yet, so the field
 * is blank; otherwise the notes saved for the lesson's version.
 */
export const versionNotesBaseline = (
  versionChanged: boolean,
  saved: string | undefined,
): string => (versionChanged ? '' : (saved ?? ''));

/**
 * The next notes draft when the typed version goes from `previous` to `next`.
 * Changing the version away from the saved one clears the notes; editing it
 * further keeps what was typed for it; typing the saved one back shows its
 * saved notes again.
 */
export function notesDraftAfterVersionEdit(
  savedVersion: string,
  previous: string | null,
  next: string,
  notesDraft: string | null,
): string | null {
  if (!isVersionDirty(next, savedVersion)) return null;
  if (!isVersionDirty(previous, savedVersion)) return null;
  return notesDraft;
}

/** The lesson editor's version notes, for the field and for Save. */
export function useVersionNotes(lesson: VersionedLesson): VersionNotes {
  const versionDraft = useAtomValue(lessonVersionDraftAtomFamily(lesson.id));
  const [draft, setDraft] = useAtom(
    lessonVersionNotesDraftAtomFamily(lesson.id),
  );
  const saved = useLessonVersionNotes(lesson.id, lesson.version);
  const versionChanged = isVersionDirty(versionDraft, lesson.version);
  const baseline = versionNotesBaseline(versionChanged, saved.data);
  return {
    value: draft ?? baseline,
    isDirty: draft !== null && draft !== baseline,
    isLoading: !versionChanged && saved.isLoading,
    setDraft,
  };
}
