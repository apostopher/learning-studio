import { GripVertical, Pencil } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { ClampedText } from '../clamped-text';
import { TooltipIconButton } from '../ui/tooltip-icon-button';
import { LessonVideoTile } from './lesson-video-tile';

/**
 * One lesson in the org-wide library. The closest analogue is `LessonCard`,
 * but this card carries none of a lesson's gates (`levels`,
 * `requiredSubscriptions`, `hasDebrief`) — those are edited on the lesson's
 * own config screen, not shown here — and it has no delete or play affordance:
 * the library is a source list to drag from, not a place to manage or
 * preview a lesson.
 *
 * It also carries NO "in N courses" badge, though `courseCount` is on the
 * type and other things still read it (the delete confirmation names the
 * count, since deleting takes the lesson out of every course at once). The
 * column is 320px wide and the name is the thing being scanned for; a
 * cross-reference that repeats on nearly every card earned none of that
 * width. Where a lesson is taught is a question the course rail answers by
 * being on screen beside this one.
 */
export const LibraryLessonCard = ({
  lesson,
  dragHandleProps,
  onEdit,
}: {
  lesson: LibraryLesson;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  onEdit?: () => void;
}) => {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-sm text-primary">
      <LessonVideoTile
        hasVideo={lesson.isConfigured}
        lessonName={lesson.name}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <ClampedText text={lesson.name} className="min-w-0 flex-1" />
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
          <button
            type="button"
            // Not "drag to reorder": the library has no order to change.
            // Dragging one of these cards places the lesson in a course, and
            // the accessible name is the only thing that says so to anyone
            // who cannot see the two panes side by side.
            aria-label={`Drag ${lesson.name} into a course module`}
            {...dragHandleProps}
            className="-me-1 shrink-0 cursor-grab rounded p-1 text-tertiary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
