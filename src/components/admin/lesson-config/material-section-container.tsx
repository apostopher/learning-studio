import { zodResolver } from '@hookform/resolvers/zod';
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

  /**
   * Hydrated by react-hook-form itself, not by an effect.
   *
   * `values` is RHF's own answer to "this form is filled from server data":
   * it reseeds when the data arrives and again whenever it genuinely changes,
   * which is what the hydrate-once effect and its `hydratedForLessonId` ref
   * were hand-rolling — the "you might not need an effect" shape from
   * docs/use-effect-rules.md.
   *
   * `keepDirtyValues` is what makes it safe to reseed more than once, and it
   * is strictly better than the old guard. The effect refused EVERY reseed
   * after the first, so a background refetch could never bring in a change;
   * this refuses only the fields the admin has actually touched, so their
   * unsaved edits survive while untouched fields pick up new server data.
   *
   * While the query is loading — and for a lesson that has no material at all —
   * there is nothing to supply, so `defaultValues` (EMPTY) stands.
   */
  const form = useForm<LessonMaterialGeneration>({
    resolver: zodResolver(LessonMaterialGenerationSchema),
    defaultValues: EMPTY,
    // `?? undefined`, not the raw value: the query resolves to `null` for a
    // lesson with no material yet, and RHF reads only `undefined` as "no
    // values supplied". Passing null would try to reseed the form with it.
    values: existing.data ?? undefined,
    resetOptions: { keepDirtyValues: true },
  });

  const attachments = form.watch('attachments') ?? [];

  const onSubmit = form.handleSubmit((values) => save.mutate(values));

  return (
    <div className="flex flex-col gap-6">
      <MaterialUpload
        isPending={parse.isPending}
        error={parse.error?.message}
        onFileSelected={(file) =>
          parse.mutate(file, {
            // `keepDefaultValues` so the parsed content reads as DIRTY
            // against the original defaults — that is what `keepDirtyValues`
            // above then protects from being overwritten by a background
            // refetch before the admin has saved it.
            onSuccess: (parsed) =>
              form.reset({ ...EMPTY, ...parsed }, { keepDefaultValues: true }),
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
