import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Loader2, Plus } from 'lucide-react';
import type { UseFormRegister } from 'react-hook-form';
import { SortableOnboardingQuestion } from './sortable-onboarding-question';

interface OnboardingFormValues {
  questions: { id: string; text: string }[];
}

interface OnboardingQuestionsEditorProps {
  fields: { key: string; id: string }[];
  register: UseFormRegister<OnboardingFormValues>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onDragEnd: (event: DragEndEvent) => void;
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => void;
}

/** Onboarding questions list: drag-reorder rows, add, and save. */
export const OnboardingQuestionsEditor = ({
  fields,
  register,
  onAdd,
  onRemove,
  onDragEnd,
  isSaving,
  isDirty,
  onSave,
}: OnboardingQuestionsEditorProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-gray-11 text-sm">
        Questions shown to users when they start this course. Drag to reorder.
      </p>

      {fields.length === 0 ? (
        <p className="rounded-lg border border-gray-6 border-dashed py-8 text-center text-gray-10 text-sm">
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
          className="inline-flex items-center gap-2 rounded-lg border border-gray-6 px-3 py-2 font-medium text-gray-12 text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add question
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-3 px-4 py-2 font-medium text-gray-12 transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          Save
        </button>
      </div>
    </div>
  );
};
