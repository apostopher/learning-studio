import { GripVertical, Pencil } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { ClampedText } from '../clamped-text';
import { chipClassName } from '../ui/chip';
import { TooltipIconButton } from '../ui/tooltip-icon-button';
import { LessonVideoTile } from './lesson-video-tile';

/**
 * One lesson in the org-wide library. The closest analogue is `LessonCard`,
 * but this card carries none of a lesson's gates (`levels`,
 * `requiredSubscriptions`, `hasDebrief`) — those are edited on the lesson's
 * own config screen, not shown here — and it has no delete or play affordance:
 * the library is a source list to drag from, not a place to manage or
 * preview a lesson.
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
  const courseNoun = lesson.courseCount === 1 ? 'course' : 'courses';

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
          {/*
            "Used" isn't a boolean — a lesson can be in the 2-week course and
            not the mini — so there is nothing here to grey out or disable.
            This badge is the only signal a card carries for that, and it is
            never rendered for an unused lesson (courseCount === 0) rather
            than rendered as a dimmed "in 0 courses".
            `apple` (navy), not `accent` (gold): this states a cross-reference
            to other courses, not a status of this lesson.
          */}
          {lesson.courseCount > 0 && (
            // `role="img"` is the same trick `Logo` and `LessonVideoTile` use
            // for a chunk of UI that needs one accessible name distinct from
            // (here, fuller than) its visible text — a bare `<span>` has no
            // implicit role, so `aria-label` on it is invalid ARIA-in-HTML.
            <span
              role="img"
              aria-label={`In ${lesson.courseCount} ${courseNoun}`}
              className={chipClassName('soft-apple', 'normal-case')}
            >
              In {lesson.courseCount} {courseNoun}
            </span>
          )}
          {onEdit && (
            <TooltipIconButton label="Edit lesson" onClick={onEdit}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
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
      </div>
    </div>
  );
};
