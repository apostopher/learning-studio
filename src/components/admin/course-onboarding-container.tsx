import type { DragEndEvent } from '@dnd-kit/core';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';

import { useCourseOnboarding } from '#/data-hooks/use-course-onboarding';
import { useUpdateCourseOnboarding } from '#/data-hooks/use-update-course-onboarding';
import type { OnboardingQuestion } from '#/types';
import { createEmptyQuestion } from './onboarding-helpers';
import {
  OnboardingQuestionsEditor,
  type OnboardingSaveStatus,
} from './onboarding-questions-editor';

const DEBOUNCE_MS = 800;

interface OnboardingFormValues {
  questions: OnboardingQuestion[];
}

/** Container: authors a course's onboarding questions with auto-save. Not render-tested. */
export const CourseOnboardingContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const query = useCourseOnboarding(courseId);
  const update = useUpdateCourseOnboarding(courseId);

  // Seed once (defaultValues, not `values`) so refetches never clobber edits.
  const form = useForm<OnboardingFormValues>({
    defaultValues: { questions: [] },
  });
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'questions',
    keyName: 'key',
  });

  const seededRef = useRef(false);
  const lastSavedRef = useRef<string | null>(null);
  const currentRef = useRef<OnboardingQuestion[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateRef = useRef(update);
  updateRef.current = update;

  // Seed the form + baselines the first time the query resolves.
  useEffect(() => {
    if (!seededRef.current && query.data) {
      seededRef.current = true;
      form.reset({ questions: query.data });
      currentRef.current = query.data;
      lastSavedRef.current = JSON.stringify(query.data);
    }
  }, [query.data, form]);

  // Debounced auto-save on any form change.
  useEffect(() => {
    const sub = form.watch((value) => {
      const questions = (value.questions ?? []) as OnboardingQuestion[];
      currentRef.current = questions;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const snapshot = JSON.stringify(questions);
        if (snapshot === lastSavedRef.current) return;
        updateRef.current.mutate(
          { questions },
          {
            onSuccess: () => {
              lastSavedRef.current = snapshot;
            },
          },
        );
      }, DEBOUNCE_MS);
    });
    return () => sub.unsubscribe();
  }, [form]);

  // Flush a best-effort save on unmount (dialog close / tab switch) and pagehide.
  useEffect(() => {
    const flush = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const questions = currentRef.current;
      const snapshot = JSON.stringify(questions);
      if (snapshot === lastSavedRef.current) return;
      lastSavedRef.current = snapshot;
      updateRef.current.mutate({ questions, fireAndForget: true });
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) move(oldIndex, newIndex);
  };

  const dirty =
    JSON.stringify(form.watch('questions')) !== lastSavedRef.current;
  const status: OnboardingSaveStatus = update.isPending
    ? 'saving'
    : update.isError
      ? 'error'
      : dirty
        ? 'unsaved'
        : 'saved';

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2
          className="h-5 w-5 animate-spin text-gray-10"
          aria-hidden="true"
        />
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
      status={status}
      onRetry={() => update.mutate({ questions: form.getValues('questions') })}
    />
  );
};
