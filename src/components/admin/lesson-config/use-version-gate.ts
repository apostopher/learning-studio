import { useAtomValue, useSetAtom } from 'jotai';
import {
  lessonVersionDraftAtomFamily,
  lessonVersionRefusalAtomFamily,
} from '#/atoms/admin';
import { lessonVersionSchema } from '#/lib/lesson-version';

/** A working copy's version, as the Disciplines editor knows it. */
export type VersionedLesson = { id: number; version: string };

export type VersionGate = {
  /** Why the typed version cannot be saved; null when it can. */
  blocked: string | null;
  /**
   * Make the write with the version to send (undefined keeps the current
   * one), or move focus to the Version field and say why not.
   */
  attempt: (write: (version: string | undefined) => void) => void;
};

/** Retyping the version a lesson already has changes nothing. */
export const isVersionDirty = (
  draft: string | null,
  version: string,
): boolean => draft !== null && draft.trim() !== version;

/**
 * What every content write in the lesson editor asks before it is made. Only
 * the format can stop it: the version is a label, and any `x.x` will do.
 */
export function useVersionGate(lesson: VersionedLesson): VersionGate {
  const draft = useAtomValue(lessonVersionDraftAtomFamily(lesson.id));
  const setRefusal = useSetAtom(lessonVersionRefusalAtomFamily(lesson.id));
  const parsed = isVersionDirty(draft, lesson.version)
    ? lessonVersionSchema.safeParse(draft)
    : null;
  const blocked =
    parsed && !parsed.success ? parsed.error.issues[0].message : null;

  return {
    blocked,
    attempt: (write) => {
      setRefusal(blocked === null ? null : {});
      if (blocked === null) write(parsed?.data);
    },
  };
}
