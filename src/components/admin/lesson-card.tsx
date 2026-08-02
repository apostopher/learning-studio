import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import type { BoardLesson } from '#/lib/admin-schemas';
import { ClampedText } from '../clamped-text';
import { LessonVideoTile } from './lesson-video-tile';
import { TooltipIconButton } from './tooltip-icon-button';

export const LessonCard = ({
  lesson,
  dragHandleProps,
  onEdit,
  onDelete,
  onPlay,
}: {
  lesson: BoardLesson;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Opens the preview modal. Omitted where there is nowhere to open it. */
  onPlay?: () => void;
}) => {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-sm text-primary">
      <LessonVideoTile
        hasVideo={lesson.isConfigured}
        lessonName={lesson.name}
        onPlay={onPlay}
      />
      <ClampedText text={lesson.name} className="min-w-0 flex-1" />
      {/*
        Replaces the status dot the tile took over from. The dot was
        `aria-hidden`, so published/draft was invisible to a screen reader and
        the board had no other cue; a word is legible to everyone and, since
        most lessons end up published, is absent most of the time.
      */}
      {!lesson.isAvailable && (
        <span className="shrink-0 rounded bg-gray-4 px-1.5 py-0.5 font-medium text-tertiary text-xs">
          Draft
        </span>
      )}
      {onEdit && (
        <TooltipIconButton label="Edit lesson" onClick={onEdit}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </TooltipIconButton>
      )}
      {onDelete && (
        <TooltipIconButton
          label="Delete lesson"
          onClick={onDelete}
          variant="danger"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </TooltipIconButton>
      )}
      <button
        type="button"
        aria-label="Drag to reorder lesson"
        {...dragHandleProps}
        className="-me-1 shrink-0 cursor-grab rounded p-1 text-tertiary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};
