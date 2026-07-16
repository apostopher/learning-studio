import { GripVertical, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import type { BoardLesson } from '@/lib/admin-schemas';
import { cn } from '@/lib/cn';
import { TooltipIconButton } from './tooltip-icon-button';

export const LessonCard = ({
  lesson,
  dragHandleProps,
  onConfigure,
  onEdit,
  onDelete,
}: {
  lesson: BoardLesson;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  onConfigure?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) => {
  const hasActions = Boolean(onEdit || onDelete || onConfigure);

  return (
    <div className="rounded-lg border border-gray-6 bg-gray-1 text-sm text-gray-12">
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            lesson.isAvailable ? 'bg-apple-9' : 'bg-gray-7',
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{lesson.name}</span>
        <button
          type="button"
          aria-label="Drag to reorder lesson"
          {...dragHandleProps}
          className="-me-1 shrink-0 cursor-grab rounded p-1 text-gray-10 transition-colors hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {hasActions && (
        <div className="flex items-center justify-end gap-1 border-t border-gray-6 px-2 py-1">
          {lesson.isConfigured && onConfigure && (
            <TooltipIconButton label="Configure lesson" onClick={onConfigure}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            </TooltipIconButton>
          )}
          <TooltipIconButton label="Edit lesson" onClick={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </TooltipIconButton>
          <TooltipIconButton
            label="Delete lesson"
            onClick={onDelete}
            variant="danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </TooltipIconButton>
        </div>
      )}

      {!lesson.isConfigured && onConfigure && (
        <div className="flex items-center justify-between gap-2 border-t border-gray-6 px-3 py-2">
          <span className="text-xs text-gray-10">Lesson is not configured</span>
          <button
            type="button"
            onClick={onConfigure}
            className="shrink-0 rounded-md bg-apple-9 px-2.5 py-1 text-xs font-medium text-apple-contrast transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-1"
          >
            Configure
          </button>
        </div>
      )}
    </div>
  );
};
