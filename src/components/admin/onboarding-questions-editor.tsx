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
import { SortableOnboardingQuestion } from './sortable-onboarding-question';

interface OnboardingFormValues {
  questions: { id: string; text: string }[];
}

export type OnboardingSaveStatus = 'saving' | 'saved' | 'unsaved' | 'error';

interface OnboardingQuestionsEditorProps {
  fields: { key: string; id: string }[];
  register: UseFormRegister<OnboardingFormValues>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onDragEnd: (event: DragEndEvent) => void;
  status: OnboardingSaveStatus;
  onRetry: () => void;
}

/** Onboarding questions list: drag-reorder rows, add, and auto-save. */
export const OnboardingQuestionsEditor = ({
  fields,
  register,
  onAdd,
  onRemove,
  onDragEnd,
  status,
  onRetry,
}: OnboardingQuestionsEditorProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-secondary text-sm">
        Questions shown to users when they start this course. Drag to reorder.
      </p>

      {fields.length === 0 ? (
        <p className="rounded-lg border border-gray-6 border-dashed py-8 text-center text-tertiary text-sm">
          No onboarding questions yet.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={fields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {fields.map((field, index) => (
                <SortableOnboardingQuestion
                  key={field.key}
                  id={field.id}
                  index={index}
                  register={register(`questions.${index}.text`)}
                  onRemove={() => onRemove(index)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-6 px-3 py-2 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add question
        </button>

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
