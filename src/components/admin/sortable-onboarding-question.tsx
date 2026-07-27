import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { AutoGrowTextarea } from './auto-grow-textarea';

interface SortableOnboardingQuestionProps {
  id: string;
  index: number;
  register: UseFormRegisterReturn;
  onRemove: () => void;
}

/** One draggable onboarding-question row. Uses dnd-kit's useSortable. */
export const SortableOnboardingQuestion = ({
  id,
  index,
  register,
  onRemove,
}: SortableOnboardingQuestionProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="flex items-start gap-2"
    >
      <button
        type="button"
        aria-label={`Reorder question ${index + 1}`}
        className="mt-1.5 cursor-grab rounded-md p-1 text-tertiary hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <AutoGrowTextarea
        {...register}
        maxLength={2000}
        placeholder="Enter an onboarding question"
        aria-label={`Onboarding question ${index + 1}`}
      />
      <button
        type="button"
        aria-label={`Remove question ${index + 1}`}
        onClick={onRemove}
        className="mt-1.5 rounded-md p-1 text-tertiary transition-colors hover:bg-red-9/15 hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};
