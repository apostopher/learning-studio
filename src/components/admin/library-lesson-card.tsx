import { GripVertical, Trash2 } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { formatVersion } from '#/lib/lesson-version';
import { ClampedText } from '../clamped-text';
import { Chip } from '../ui/chip';
import { TooltipIconButton } from '../ui/tooltip-icon-button';
import { LessonVideoTile } from './lesson-video-tile';

/**
 * One lesson in the org-wide library. The closest analogue is `LessonCard`,
 * but this card carries none of a lesson's gates (`levels`,
 * `requiredSubscriptions`, `hasDebrief`) — those are edited on the lesson's
 * own config screen, not shown here — and it has no delete or play affordance:
 * the library is a source list to drag from, not a place to manage or
 * preview a lesson. Nor does it say whether students see it: each course
 * decides that for itself.
 *
 * It also carries NO "in N courses" badge, though `courseCount` is on the
 * type and other things still read it (a lesson in use cannot be deleted).
 * The column is 320px wide and the name is the thing being scanned for; a
 * cross-reference that repeats on nearly every card earned none of that
 * width. Where a lesson is taught is a question the course rail answers by
 * being on screen beside this one.
 */
export const LibraryLessonCard = ({
  lesson,
  dragHandleProps,
  onEdit,
  onDelete,
  posterUrl,
}: {
  lesson: LibraryLesson;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  /** Opens the delete dialog, which refuses a lesson some course shows. */
  onDelete?: () => void;
  /** The lesson's poster frame when its shelf has one; absent, the tile draws its plain placeholder. */
  posterUrl?: string | null;
  onEdit?: () => void;
}) => {
  return (
    // Hover and keyboard-focus treatment: an outline in ITPS's orange
    // (`warning-9`), colour-only. An outline rather than a border so the
    // card never changes size; `transition` on the two colours only, at
    // 150ms — a hover is seen tens of times a day and must feel instant,
    // not animated. No lift or scale: the card is a dnd sortable, and a
    // transform on the hover target moves it out from under the cursor.
    // `has-focus-visible`, not `focus-within`: the card is not focusable,
    // its buttons are, and only KEYBOARD focus on one of them should light
    // the whole card — a mouse click on the thumbnail would otherwise leave the
    // outline stuck on until blur.
    <div className="flex items-center gap-2 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-sm text-primary outline outline-2 outline-offset-0 outline-transparent transition-[outline-color,background-color] duration-150 hover:bg-gray-2 hover:outline-warning-9 has-focus-visible:outline-warning-9">
      <LessonVideoTile
        hasVideo={lesson.isConfigured}
        lessonName={lesson.name}
        posterUrl={posterUrl}
        // The thumbnail IS the Edit button — there is no separate pencil, so
        // the name gets the width it used to share with one.
        onEdit={onEdit}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* The name gets the whole line, matching the course card. */}
        <ClampedText text={lesson.name} className="min-w-0" />
        <div className="flex items-center gap-2">
          {/* Neutral: the working copy is never behind, so there is no state
              to colour. */}
          <Chip tone="neutral" className="normal-case tabular-nums">
            {formatVersion(lesson.version)}
          </Chip>
          <span className="flex-1" />
          {onDelete && (
            <TooltipIconButton label="Delete lesson" onClick={onDelete}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
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
