import { Accordion } from '@base-ui/react/accordion';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Check, Loader2, Plus } from 'lucide-react';
import type { UseFormRegister } from 'react-hook-form';
import type { OnboardingFormValues } from '#/components/admin/onboarding-form-values';
import { MAX_ONBOARDING_CATEGORIES, MAX_ONBOARDING_QUESTIONS } from '#/types';
import { SortableOnboardingCategory } from './sortable-onboarding-category';

export type OnboardingSaveStatus = 'saving' | 'saved' | 'unsaved' | 'error';

interface OnboardingQuestionsEditorProps {
  /** Categories in order, each with its questions in order. */
  categories: readonly {
    key: string;
    id: string;
    questions: { id: string }[];
  }[];
  /** Names live in form state, not in `categories` — read them for labels. */
  categoryNames: readonly string[];
  questionCount: number;
  register: UseFormRegister<OnboardingFormValues>;
  openCategories: string[];
  onOpenCategoriesChange: (value: string[]) => void;
  onAddCategory: () => void;
  onRemoveCategory: (index: number) => void;
  onCategoryDragEnd: (event: DragEndEvent) => void;
  onAddQuestion: (categoryIndex: number) => void;
  onRemoveQuestion: (categoryIndex: number, questionIndex: number) => void;
  onQuestionDragEnd: (categoryIndex: number, event: DragEndEvent) => void;
  status: OnboardingSaveStatus;
  onRetry: () => void;
}

/**
 * Onboarding questions, grouped into drag-reorderable category accordions with
 * auto-save.
 *
 * Presentational and hookless apart from dnd-kit's own sensor hooks (the same
 * allowance `sortable-onboarding-question.tsx` already relies on). Accordion
 * open state is CONTROLLED from the container rather than left to Base UI's
 * uncontrolled `defaultValue`: `defaultValue` is only read on first render, so
 * a newly added category would appear collapsed and the admin would have to
 * expand it before they could type the question it was created with.
 */
export const OnboardingQuestionsEditor = ({
  categories,
  categoryNames,
  questionCount,
  register,
  openCategories,
  onOpenCategoriesChange,
  onAddCategory,
  onRemoveCategory,
  onCategoryDragEnd,
  onAddQuestion,
  onRemoveQuestion,
  onQuestionDragEnd,
  status,
  onRetry,
}: OnboardingQuestionsEditorProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const atCategoryCap = categories.length >= MAX_ONBOARDING_CATEGORIES;
  const atQuestionCap = questionCount >= MAX_ONBOARDING_QUESTIONS;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-secondary text-sm">
        Questions shown to users when they start this course, grouped by topic.
        Drag to reorder categories, or questions within a category. The
        assistant uses the grouping to move between topics naturally — it never
        reads category names aloud.
      </p>

      {categories.length === 0 ? (
        <p className="rounded-lg border border-gray-6 border-dashed py-8 text-center text-tertiary text-sm">
          No categories yet.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onCategoryDragEnd}
        >
          <SortableContext
            items={categories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <Accordion.Root
              value={openCategories}
              onValueChange={onOpenCategoriesChange}
              className="flex flex-col gap-3"
            >
              {categories.map((category, index) => (
                <SortableOnboardingCategory
                  key={category.key}
                  id={category.id}
                  index={index}
                  name={categoryNames[index] ?? ''}
                  questions={category.questions}
                  register={register}
                  onAddQuestion={() => onAddQuestion(index)}
                  onRemoveQuestion={(questionIndex) =>
                    onRemoveQuestion(index, questionIndex)
                  }
                  onQuestionDragEnd={(event) => onQuestionDragEnd(index, event)}
                  onRemoveCategory={() => onRemoveCategory(index)}
                />
              ))}
            </Accordion.Root>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onAddCategory}
            disabled={atCategoryCap || atQuestionCap}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-6 px-3 py-2 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:cursor-not-allowed disabled:text-disabled disabled:hover:bg-transparent"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add category
          </button>
          {atCategoryCap ? (
            <span className="text-tertiary text-xs">
              Limit of {MAX_ONBOARDING_CATEGORIES} categories reached.
            </span>
          ) : atQuestionCap ? (
            <span className="text-tertiary text-xs">
              Limit of {MAX_ONBOARDING_QUESTIONS} questions reached.
            </span>
          ) : null}
        </div>

        <span aria-live="polite" className="min-w-0">
          {status === 'saving' ? (
            <span className="flex items-center gap-1.5 text-tertiary text-sm">
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
              Saving…
            </span>
          ) : status === 'error' ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-error-text">Couldn’t save.</span>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md px-2 py-1 font-medium text-primary text-xs hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
              >
                Retry
              </button>
            </span>
          ) : status === 'unsaved' ? (
            <span className="text-tertiary text-sm">Unsaved changes…</span>
          ) : (
            <span className="flex items-center gap-1.5 text-tertiary text-sm">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              All changes saved
            </span>
          )}
        </span>
      </div>
    </div>
  );
};
