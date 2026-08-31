import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useLessonMaterial } from '#/data-hooks/use-lesson-material';
import { useParseLessonMaterial } from '#/data-hooks/use-parse-lesson-material';
import { useSaveLessonMaterial } from '#/data-hooks/use-save-lesson-material';
import type { LessonMaterialGeneration } from '#/types';
import { LessonMaterialGenerationSchema } from '#/types';
import { AttachmentsList } from './attachments-list';
import { MaterialForm } from './material-form';
import { MaterialUpload } from './material-upload';

const EMPTY: LessonMaterialGeneration = {
  text: '',
  keyPoints: [],
  proTips: '',
  quiz: [],
  links: [],
  assignments: '',
  jobOfTheDay: '',
  attachments: [],
};

/**
 * Material tab: load existing material into an editable form, optionally refill
 * it from a parsed .docx, and save. The container owns useForm and the hooks;
 * the field components are pure.
 */
export const MaterialSectionContainer = ({
  lesson,
}: {
  /**
   * Only the id is read — every hook below is lesson-scoped. Typed as the
   * narrow shape rather than `BoardLesson` so the org-level editor, whose
   * lessons carry no video fields at all (`editorBoardLessonSchema` omits
   * them), can drive this section too.
   */
  lesson: { id: number };
}) => {
  const existing = useLessonMaterial(lesson.id);
  const parse = useParseLessonMaterial(lesson.id);
  const save = useSaveLessonMaterial(lesson.id);

  const form = useForm<LessonMaterialGeneration>({
    resolver: zodResolver(LessonMaterialGenerationSchema),
    defaultValues: EMPTY,
  });

  const hydratedForLessonId = useRef<number | null>(null);
  const existingData = existing.data;
  // Hydrate the form once per lesson (when its material first loads). Background
  // refetches of the same lesson must NOT reset — that would wipe unsaved edits.
  // A lesson switch re-hydrates because hydratedForLessonId no longer matches.
  // biome-ignore lint/correctness/useExhaustiveDependencies: form is stable; intentionally hydrate once per lesson.
  useEffect(() => {
    if (existing.isLoading) return;
    if (hydratedForLessonId.current === lesson.id) return;
    hydratedForLessonId.current = lesson.id;
    form.reset(existingData ?? EMPTY);
  }, [lesson.id, existing.isLoading, existingData]);

  const attachments = form.watch('attachments') ?? [];

  const onSubmit = form.handleSubmit((values) => save.mutate(values));

  return (
    <div className="flex flex-col gap-6">
      <MaterialUpload
        isPending={parse.isPending}
        error={parse.error?.message}
        onFileSelected={(file) =>
          parse.mutate(file, {
            onSuccess: (parsed) => form.reset({ ...EMPTY, ...parsed }),
          })
        }
      />
      <AttachmentsList attachments={attachments} />
      <MaterialForm
        register={form.register}
        control={form.control}
        errors={form.formState.errors}
        onSubmit={onSubmit}
        isSaving={save.isPending}
        saveError={save.error?.message}
      />
    </div>
  );
};
