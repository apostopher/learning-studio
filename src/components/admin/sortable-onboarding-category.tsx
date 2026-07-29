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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { UseFormRegister } from 'react-hook-form';
import type { OnboardingFormValues } from '#/components/admin/onboarding-form-values';
import { SortableOnboardingQuestion } from './sortable-onboarding-question';

interface SortableOnboardingCategoryProps {
  id: string;
  index: number;
  name: string;
  questions: readonly { id: string }[];
  register: UseFormRegister<OnboardingFormValues>;
  onAddQuestion: () => void;
  onRemoveQuestion: (questionIndex: number) => void;
  onQuestionDragEnd: (event: DragEndEvent) => void;
  onRemoveCategory: () => void;
}

/**
 * One category: a draggable accordion panel holding its own sortable question
 * list.
 *
 * The questions get their own `DndContext` scoped to this category, which is
 * what makes cross-category dragging impossible by construction rather than by
 * a guard that could be missed — a question dragged here can only ever land on
 * a sibling in the same list. Category reordering runs in the parent's separate
 * context.
 */
export const SortableOnboardingCategory = ({
  id,
  index,
  name,
  questions,
  register,
  onAddQuestion,
  onRemoveQuestion,
  onQuestionDragEnd,
  onRemoveCategory,
}: SortableOnboardingCategoryProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const label = name.trim() || `Category ${index + 1}`;

  return (
    <Accordion.Item
      value={id}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="flex flex-col rounded-lg border border-gray-6 bg-gray-2"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-label={`Reorder category ${label}`}
          className="cursor-grab rounded-md p-1 text-tertiary hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        <input
          {...register(`categories.${index}.name`)}
          maxLength={100}
          placeholder="Category name"
          aria-label={`Category ${index + 1} name`}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-medium text-primary text-sm hover:border-gray-6 focus-visible:border-gray-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        />

        <span className="shrink-0 text-tertiary text-xs tabular-nums">
          {questions.length}
          {questions.length === 1 ? ' question' : ' questions'}
        </span>

        <button
          type="button"
          aria-label={`Remove category ${label}`}
          onClick={onRemoveCategory}
          className="rounded-md p-1 text-tertiary transition-colors hover:bg-error-9/15 hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>

        <Accordion.Header className="contents">
          <Accordion.Trigger
            aria-label={`Toggle category ${label}`}
            className="group rounded-md p-1 text-tertiary hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          >
            <ChevronDown
              className="h-4 w-4 transition-transform group-data-[panel-open]:rotate-180"
              aria-hidden="true"
            />
          </Accordion.Trigger>
        </Accordion.Header>
      </div>

      <Accordion.Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-gray-6 border-t px-3 py-3">
          {questions.length === 0 ? (
            <p className="py-2 text-tertiary text-sm">
              No questions in this category yet — it will be skipped.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onQuestionDragEnd}
            >
              <SortableContext
                items={questions.map((q) => q.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-3">
                  {questions.map((question, questionIndex) => (
                    <SortableOnboardingQuestion
                      key={question.id}
                      id={question.id}
                      index={questionIndex}
                      register={register(
                        `categories.${index}.questions.${questionIndex}.text`,
                      )}
                      onRemove={() => onRemoveQuestion(questionIndex)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* `ms-8` lines the button's inline-start edge up with the question
              textareas rather than the drag-handle column: each row is a
              24px handle (16px icon + p-1) plus the row's gap-2, so the
              inputs start 32px in. Logical, so it mirrors in RTL with the
              rows it is aligning to. */}
          <button
            type="button"
            onClick={onAddQuestion}
            className="ms-8 inline-flex w-fit items-center gap-2 rounded-lg border border-gray-6 px-3 py-1.5 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add question
          </button>
        </div>
      </Accordion.Panel>
    </Accordion.Item>
  );
};
