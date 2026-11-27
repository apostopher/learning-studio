import { useAtom } from 'jotai';
import { lessonVersionNotesDraftAtomFamily } from '#/atoms/admin';
import { useLessonVersionNotes } from '#/data-hooks/use-lesson-version-notes';

export type VersionNotes = {
  /** What the field shows: the typed draft, else the saved notes. */
  value: string;
  /** Typed and different from what is saved. */
  isDirty: boolean;
  /** The saved notes are still loading, so the field has nothing to show. */
  isLoading: boolean;
  setDraft: (next: string | null) => void;
};

/**
 * The lesson editor's version notes, for the field and for Save: one running
 * note per lesson that the SME appends to as the version moves on. Changing
 * the version leaves it alone.
 */
export function useVersionNotes(lessonId: number): VersionNotes {
  const [draft, setDraft] = useAtom(
    lessonVersionNotesDraftAtomFamily(lessonId),
  );
  const saved = useLessonVersionNotes(lessonId);
  const baseline = saved.data ?? '';
  return {
    value: draft ?? baseline,
    isDirty: draft !== null && draft !== baseline,
    isLoading: saved.isLoading,
    setDraft,
  };
}
