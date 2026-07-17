import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useLessonMaterial } from '#/data-hooks/use-lesson-material';
import { useParseLessonMaterial } from '#/data-hooks/use-parse-lesson-material';
import { useSaveLessonMaterial } from '#/data-hooks/use-save-lesson-material';
import type { BoardLesson } from '#/lib/admin-schemas';
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
  lesson: BoardLesson;
}) => {
  const existing = useLessonMaterial(lesson.id);
  const parse = useParseLessonMaterial();
  const save = useSaveLessonMaterial(lesson.id);

  const form = useForm<LessonMaterialGeneration>({
    resolver: zodResolver(LessonMaterialGenerationSchema),
    defaultValues: EMPTY,
  });

  // Load saved material (or reset to empty) whenever the lesson changes and its
  // material query resolves.
  const existingData = existing.data;
  // biome-ignore lint/correctness/useExhaustiveDependencies: form is stable; reset on lesson switch or when saved data arrives.
  useEffect(() => {
    form.reset(existingData ?? EMPTY);
  }, [lesson.id, existingData]);

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
