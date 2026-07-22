import type { DragEndEvent } from '@dnd-kit/core';
import { Loader2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { useCourseOnboarding } from '#/data-hooks/use-course-onboarding';
import { useUpdateCourseOnboarding } from '#/data-hooks/use-update-course-onboarding';
import type { OnboardingQuestion } from '#/types';
import { createEmptyQuestion } from './onboarding-helpers';
import { OnboardingQuestionsEditor } from './onboarding-questions-editor';

interface OnboardingFormValues {
  questions: OnboardingQuestion[];
}

/** Container: authors a course's onboarding questions. Not render-tested. */
export const CourseOnboardingContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const query = useCourseOnboarding(courseId);
  const update = useUpdateCourseOnboarding(courseId);

  const form = useForm<OnboardingFormValues>({
    values: { questions: query.data ?? [] },
  });
  // keyName 'key' so RHF's field key never collides with our own `id`.
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'questions',
    keyName: 'key',
  });

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) move(oldIndex, newIndex);
  };

  const onSave = form.handleSubmit((values) => {
    update.mutate(values.questions, {
      onSuccess: () => {
        toast.success('Onboarding questions saved');
        form.reset(values); // clear dirty state
      },
      onError: () => toast.error('Could not save. Please try again.'),
    });
  });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-gray-10" aria-hidden="true" />
      </div>
    );
  }

  return (
    <OnboardingQuestionsEditor
      fields={fields}
      register={form.register}
      onAdd={() => append(createEmptyQuestion())}
      onRemove={remove}
      onDragEnd={onDragEnd}
      isSaving={update.isPending}
      isDirty={form.formState.isDirty}
      onSave={onSave}
    />
  );
};
