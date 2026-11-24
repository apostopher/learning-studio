import { useAtomValue, useSetAtom } from 'jotai';
import {
  lessonVersionDraftAtomFamily,
  lessonVersionRefusalAtomFamily,
} from '#/atoms/admin';
import { VersionConflictError } from '#/data-hooks/version-conflict';
import {
  lessonVersionSchema,
  lockedVersionMessage,
  notHigherVersionMessage,
  type VersionState,
  versionEditError,
} from '#/lib/lesson-version';

/** A working copy's version, as the Disciplines editor knows it. */
export type VersionedLesson = { id: number } & VersionState & {
    /** Courses on exactly `version`. */
    versionCourseCount: number;
  };

export type VersionGate = {
  /** Send this with the write; undefined keeps the current version. */
  version: string | undefined;
  /** Why the write may not be made; null when it may. */
  blocked: string | null;
  /**
   * Say why at the Version field and move focus there: what `blocked` says
   * from now on, or the server's message.
   */
  refuse: (message?: string) => void;
  /** Make the write if the version allows it; otherwise refuse. */
  attempt: (write: (version: string | undefined) => void) => void;
  /** A write's `onError`: a version the server refused is said at the field. */
  onError: (error: Error) => void;
  /** A write's error as its own form shows it: the field has the other kind. */
  formError: (error: Error | null | undefined) => string | undefined;
};

/** What a draft does to a lesson: the version to send, or why not. */
function judge(
  lesson: VersionedLesson,
  draft: string | null,
): Pick<VersionGate, 'version' | 'blocked'> {
  const isDirty = isVersionDirty(draft, lesson.version);
  const parsed = isDirty ? lessonVersionSchema.safeParse(draft) : null;
  if (parsed && !parsed.success) {
    return { version: undefined, blocked: parsed.error.issues[0].message };
  }
  const version = parsed?.data;
  const error = versionEditError(lesson, version);
  if (error === null) return { version, blocked: null };
  return {
    version,
    blocked:
      error.reason === 'locked'
        ? lockedVersionMessage(lesson.version, lesson.versionCourseCount)
        : notHigherVersionMessage(error.than),
  };
}

/** Retyping the version a lesson already has changes nothing. */
export const isVersionDirty = (
  draft: string | null,
  version: string,
): boolean => draft !== null && draft.trim() !== version;

/** What every content write in the lesson editor asks before it is made. */
export function useVersionGate(lesson: VersionedLesson): VersionGate {
  const draft = useAtomValue(lessonVersionDraftAtomFamily(lesson.id));
  const setRefusal = useSetAtom(lessonVersionRefusalAtomFamily(lesson.id));
  const { version, blocked } = judge(lesson, draft);

  const refuse = (message: string | null = null) =>
    setRefusal({ message, focus: {} });
  const isRefusal = (error: Error): boolean =>
    error instanceof VersionConflictError;

  return {
    version,
    blocked,
    refuse,
    attempt: (write) => {
      if (blocked !== null) return refuse();
      setRefusal(null);
      write(version);
    },
    onError: (error) => {
      if (isRefusal(error)) refuse(error.message);
    },
    formError: (error) =>
      error && !isRefusal(error) ? error.message : undefined,
  };
}
