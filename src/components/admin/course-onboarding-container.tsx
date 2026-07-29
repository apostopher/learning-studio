import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { atom, useAtom } from 'jotai';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';

import type { OnboardingFormValues } from '#/components/admin/onboarding-form-values';
import { useCourseOnboarding } from '#/data-hooks/use-course-onboarding';
import { useUpdateCourseOnboarding } from '#/data-hooks/use-update-course-onboarding';
import type { OnboardingQuestions } from '#/types';
import {
  countCategoryQuestions,
  createEmptyCategory,
  createEmptyQuestion,
} from './onboarding-helpers';
import {
  OnboardingQuestionsEditor,
  type OnboardingSaveStatus,
} from './onboarding-questions-editor';

const DEBOUNCE_MS = 800;

/**
 * Which category accordions are expanded. Ephemeral (never persisted) — the
 * editor lives in a modal, and a remembered collapse state across sessions
 * would hide questions from someone who did not collapse them.
 */
const openCategoriesAtom = atom<string[]>([]);

/** Container: authors a course's onboarding categories with auto-save. Not render-tested. */
export const CourseOnboardingContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const query = useCourseOnboarding(courseId);
  const update = useUpdateCourseOnboarding(courseId);
  const [openCategories, setOpenCategories] = useAtom(openCategoriesAtom);

  // Seed once (defaultValues, not `values`) so refetches never clobber edits.
  const form = useForm<OnboardingFormValues>({
    defaultValues: { categories: [] },
  });
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'categories',
    keyName: 'key',
  });

  const seededRef = useRef(false);
  const lastSavedRef = useRef<string | null>(null);
  const currentRef = useRef<OnboardingQuestions>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateRef = useRef(update);
  updateRef.current = update;
  const resaveRef = useRef(false);
  const savingRef = useRef(false);

  // Seed the form + baselines the first time the query resolves, and expand
  // every category: the first use of this editor is authoring from scratch,
  // where anything collapsed by default reads as missing data.
  useEffect(() => {
    if (!seededRef.current && query.data) {
      seededRef.current = true;
      form.reset({ categories: query.data });
      currentRef.current = query.data;
      lastSavedRef.current = JSON.stringify(query.data);
      setOpenCategories(query.data.map((c) => c.id));
    }
  }, [query.data, form, setOpenCategories]);

  // Debounced auto-save on any change. Serialized: at most one save in flight;
  // if edits arrive during a save, requeue and re-save the latest on settle.
  useEffect(() => {
    const saveNow = (categories: OnboardingQuestions) => {
      const snapshot = JSON.stringify(categories);
      if (snapshot === lastSavedRef.current) return;
      if (savingRef.current) {
        resaveRef.current = true;
        return;
      }
      savingRef.current = true;
      updateRef.current.mutate(
        { questions: categories },
        {
          onSuccess: () => {
            lastSavedRef.current = snapshot;
          },
          onSettled: () => {
            savingRef.current = false;
            if (resaveRef.current) {
              resaveRef.current = false;
              saveNow(currentRef.current);
            }
          },
        },
      );
    };
    const sub = form.watch((value) => {
      const categories = (value.categories ?? []) as OnboardingQuestions;
      currentRef.current = categories;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => saveNow(categories), DEBOUNCE_MS);
    });
    return () => sub.unsubscribe();
  }, [form]);

  // Flush a best-effort save on unmount (dialog close / tab switch) and pagehide.
  useEffect(() => {
    const flush = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const categories = currentRef.current;
      const snapshot = JSON.stringify(categories);
      if (snapshot === lastSavedRef.current) return;
      lastSavedRef.current = snapshot;
      // Beacon even if a normal save is in flight — that fetch is cancelled on
      // a real page unload, so this is the only guaranteed write.
      updateRef.current.mutate({ questions: categories, fireAndForget: true });
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const onCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) move(oldIndex, newIndex);
  };

  // Questions are reordered with setValue rather than a nested useFieldArray.
  // A nested field array would have to be called from a per-category child
  // component, which would make that row stateful; question ids are stable
  // uuids and serve as React keys, so a plain array swap is equivalent here.
  // `shouldDirty` is what makes `form.watch` fire and the autosave run.
  const onQuestionDragEnd = (categoryIndex: number, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const path = `categories.${categoryIndex}.questions` as const;
    const questions = form.getValues(path) ?? [];
    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    form.setValue(path, arrayMove(questions, oldIndex, newIndex), {
      shouldDirty: true,
    });
  };

  const onAddQuestion = (categoryIndex: number) => {
    const path = `categories.${categoryIndex}.questions` as const;
    const questions = form.getValues(path) ?? [];
    form.setValue(path, [...questions, createEmptyQuestion()], {
      shouldDirty: true,
    });
  };

  const onRemoveQuestion = (categoryIndex: number, questionIndex: number) => {
    const path = `categories.${categoryIndex}.questions` as const;
    const questions = form.getValues(path) ?? [];
    form.setValue(
      path,
      questions.filter((_, i) => i !== questionIndex),
      { shouldDirty: true },
    );
  };

  const onAddCategory = () => {
    const category = createEmptyCategory();
    append(category);
    // Expand it immediately — it ships with one blank question, and an admin
    // who cannot see that question has no way to tell the category isn't empty.
    setOpenCategories((open) => [...open, category.id]);
  };

  // Confirmed because autosave plus a full-replace endpoint means there is
  // nowhere to undo from once the debounce fires, and a category takes every
  // question inside it.
  const onRemoveCategory = (index: number) => {
    const category = form.getValues(`categories.${index}`);
    const count = category?.questions?.length ?? 0;
    const label = category?.name?.trim() || `Category ${index + 1}`;
    const confirmed =
      count === 0 ||
      window.confirm(
        `Delete “${label}” and its ${count} ${count === 1 ? 'question' : 'questions'}? This can’t be undone.`,
      );
    if (!confirmed) return;
    remove(index);
    if (category) {
      setOpenCategories((open) => open.filter((id) => id !== category.id));
    }
  };

  const watchedCategories = form.watch('categories') ?? [];
  const dirty = JSON.stringify(watchedCategories) !== lastSavedRef.current;
  const status: OnboardingSaveStatus = update.isPending
    ? 'saving'
    : update.isError
      ? 'error'
      : dirty
        ? 'unsaved'
        : 'saved';

  if (query.isError) {
    return (
      <p className="py-8 text-center text-error-text text-sm">
        Couldn't load onboarding questions. Please close and reopen the dialog.
      </p>
    );
  }

  if (query.isLoading || !seededRef.current) {
    return (
      <div className="flex justify-center py-10">
        <Loader2
          className="h-5 w-5 animate-spin text-tertiary"
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <OnboardingQuestionsEditor
      // `fields` holds RHF's synthetic `key` plus the seeded category id, but
      // its `questions` are the seed-time snapshot. Read those from `watch` so
      // adding or reordering a question re-renders the list.
      categories={fields.map((field, index) => ({
        key: field.key,
        id: field.id,
        questions: watchedCategories[index]?.questions ?? [],
      }))}
      categoryNames={watchedCategories.map((c) => c?.name ?? '')}
      questionCount={countCategoryQuestions(watchedCategories)}
      register={form.register}
      openCategories={openCategories}
      onOpenCategoriesChange={setOpenCategories}
      onAddCategory={onAddCategory}
      onRemoveCategory={onRemoveCategory}
      onCategoryDragEnd={onCategoryDragEnd}
      onAddQuestion={onAddQuestion}
      onRemoveQuestion={onRemoveQuestion}
      onQuestionDragEnd={onQuestionDragEnd}
      status={status}
      onRetry={() => {
        const categories = form.getValues('categories');
        update.mutate(
          { questions: categories },
          {
            onSuccess: () => {
              lastSavedRef.current = JSON.stringify(categories);
            },
          },
        );
      }}
    />
  );
};
