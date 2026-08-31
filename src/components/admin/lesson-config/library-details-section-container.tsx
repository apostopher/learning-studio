import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { useUpdateLibraryLesson } from '#/data-hooks/use-update-library-lesson';
import {
  type RenameLessonInput,
  renameLessonInputSchema,
} from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { BinaryToggle } from './binary-toggle';
import { ConfigSettingRow } from './config-setting-row';

type AvailabilityValue = 'public' | 'private';

/**
 * The lesson-LEVEL settings: its name and whether learners can open it.
 *
 * Both are properties of the lesson itself, so they read and write the same
 * way from every course teaching it — which is what makes them safe to edit
 * from `/admin/editor`, where there is no course in scope. Gates
 * (`requiredSubscriptions`, `levels`, debrief, video-watch) deliberately stay
 * on the per-course configure surface: those describe how one course teaches
 * the lesson, and editing them without naming a course would silently change
 * every course at once.
 *
 * The name is a form (typed, submitted, validated) while availability is a
 * toggle that saves on change — matching how each already behaves on the
 * per-course surface, so the two screens do not teach different habits.
 */
export const LibraryDetailsSectionContainer = ({
  lesson,
}: {
  lesson: { id: number; name: string; isAvailable: boolean };
}) => {
  const update = useUpdateLibraryLesson();
  const form = useForm<RenameLessonInput>({
    resolver: zodResolver(renameLessonInputSchema),
    mode: 'onSubmit',
    defaultValues: { name: lesson.name },
  });

  const { reset } = form;
  // Reseeds when the modal is pointed at a different lesson. The dialog is
  // mounted once for the whole editor and outlives every opening, so the
  // defaults above are read long before any lesson is chosen.
  //
  // biome-ignore lint/correctness/useExhaustiveDependencies: lesson.id is not read in the body but IS the trigger — two lessons can share a name, and without it switching between them would keep the first one's unsaved draft in the field
  useEffect(() => {
    reset({ name: lesson.name });
  }, [lesson.id, lesson.name, reset]);

  const onSubmitName = form.handleSubmit((values) => {
    if (values.name === lesson.name) return;
    update.mutate(
      { lessonId: lesson.id, name: values.name },
      {
        onSuccess: () => toast.success('Lesson renamed'),
        onError: (error) => toast.error(error.message),
      },
    );
  });

  return (
    <div className="flex flex-col">
      <ConfigSettingRow
        title="Name"
        description="What this lesson is called everywhere it is taught."
        layout="stacked"
      >
        <form onSubmit={onSubmitName} noValidate className="flex gap-2">
          <input
            {...form.register('name')}
            id="library-lesson-name"
            type="text"
            aria-label="Lesson name"
            aria-invalid={!!form.formState.errors.name}
            className={cn(
              'w-full min-w-0 rounded-lg border bg-gray-1 px-3.5 py-2.5 text-primary text-sm outline-none transition-colors duration-100',
              'focus-visible:border-apple-9 focus-visible:ring-2 focus-visible:ring-apple-9',
              form.formState.errors.name
                ? 'border-error-9 focus-visible:border-error-9 focus-visible:ring-error-9'
                : 'border-gray-6 hover:border-gray-8',
            )}
          />
          <button
            type="submit"
            disabled={update.isPending}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-apple-9 px-4 py-2.5 font-medium text-apple-contrast text-sm',
              'transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {update.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Save
          </button>
        </form>
        {form.formState.errors.name && (
          <p role="alert" className="mt-1.5 text-error-text text-sm">
            {form.formState.errors.name.message}
          </p>
        )}
      </ConfigSettingRow>

      <ConfigSettingRow
        title="Availability"
        description="Whether learners can see and open this lesson, in every course that teaches it."
      >
        <BinaryToggle<AvailabilityValue>
          label="Availability"
          value={lesson.isAvailable ? 'public' : 'private'}
          onValueChange={(next) =>
            update.mutate(
              { lessonId: lesson.id, isAvailable: next === 'public' },
              { onError: (error) => toast.error(error.message) },
            )
          }
          options={[
            { value: 'public', label: 'Public' },
            { value: 'private', label: 'Private' },
          ]}
        />
      </ConfigSettingRow>
    </div>
  );
};
