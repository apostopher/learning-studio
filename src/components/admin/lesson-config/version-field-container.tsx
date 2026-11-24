import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  lessonVersionDraftAtomFamily,
  lessonVersionRefusalAtomFamily,
} from '#/atoms/admin';
import { useIsSavingLessonContent } from '#/data-hooks/version-conflict';
import {
  type SetLessonVersionInput,
  setLessonVersionInputSchema,
} from '#/lib/admin-schemas';
import { isVersionLocked, lockedVersionMessage } from '#/lib/lesson-version';
import { lessonMaterialFormId } from './material-form-id';
import { isVersionDirty, type VersionedLesson } from './use-version-gate';
import { VersionField } from './version-field';

/**
 * The Version field of the Disciplines lesson editor. It saves nothing itself:
 * what is typed goes to the draft atom, and each content write in the dialog
 * sends it.
 */
export const VersionFieldContainer = ({
  lesson,
}: {
  lesson: VersionedLesson;
}) => {
  const [draft, setDraft] = useAtom(lessonVersionDraftAtomFamily(lesson.id));
  const [refusal, setRefusal] = useAtom(
    lessonVersionRefusalAtomFamily(lesson.id),
  );
  const isSaving = useIsSavingLessonContent(lesson.id);
  const form = useForm<SetLessonVersionInput>({
    resolver: zodResolver(setLessonVersionInputSchema),
    // Left malformed is said at once; after that, as it is corrected.
    mode: 'onTouched',
    defaultValues: { version: lesson.version },
  });

  /**
   * A draft equal to the lesson's version is spent: a write saved it, or it
   * was typed back. Read off the lesson rather than cleared by each write, so
   * no write can see the draft gone and the lesson still on the old version.
   */
  useEffect(() => {
    if (draft === null) {
      form.resetField('version', { defaultValue: lesson.version });
    } else if (!isVersionDirty(draft, lesson.version)) {
      setDraft(null);
    }
  }, [draft, lesson.version, form, setDraft]);

  // Not while disabled: a refused write can still be settling, and a disabled
  // field takes no focus.
  useEffect(() => {
    if (refusal && !isSaving) form.setFocus('version');
  }, [refusal, isSaving, form]);

  // The dialog was closed, or pointed at another lesson.
  useEffect(
    () => () => {
      setDraft(null);
      setRefusal(null);
    },
    [setDraft, setRefusal],
  );

  return (
    <VersionField
      id={`lesson-version-${lesson.id}`}
      formId={lessonMaterialFormId(lesson.id)}
      register={form.register('version', {
        onChange: (event) => {
          setDraft(event.target.value);
          setRefusal(null);
        },
      })}
      error={refusal?.message ?? form.formState.errors.version?.message}
      lockedReason={
        isVersionLocked(lesson)
          ? lockedVersionMessage(lesson.version, lesson.versionCourseCount)
          : null
      }
      disabled={isSaving}
    />
  );
};
