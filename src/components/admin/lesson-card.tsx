import { CircleMinus, GripVertical, Pencil, Trash2 } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { BoardLesson } from '#/lib/admin-schemas';
import { ClampedText } from '../clamped-text';
import { TooltipIconButton } from '../ui/tooltip-icon-button';
import { LessonVideoTile } from './lesson-video-tile';

/**
 * Only the fields this card actually reads.
 *
 * Deliberately not `BoardLesson`: the same card renders on the per-course
 * board and in the knowledge editor, and the editor's board carries strictly
 * less (no `videoProvider`/`videoRef` — see `editorBoardLessonSchema`). Asking
 * for the full type here would have forced the editor's payload to keep a
 * directly-streamable Mux ref it never reads.
 */
export type LessonCardLesson = Pick<
  BoardLesson,
  'name' | 'isAvailable' | 'isConfigured'
>;

export const LessonCard = ({
  lesson,
  posterUrl,
  dragHandleProps,
  onEdit,
  remove,
  onDelete,
  deleteUnavailableReason,
  onPlay,
  quickshotSlot,
}: {
  lesson: LessonCardLesson;
  /** Poster frame for this lesson's video, when its provider exposes one. */
  posterUrl?: string | null;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  onEdit?: () => void;
  /**
   * Take this lesson out of the module it is sitting in — a placement is
   * deleted, the lesson survives. A different act from `onDelete`, which is
   * why it gets its own icon, its own (neutral, not danger) colour and its
   * own wording rather than a second red bin.
   *
   * One object rather than three loose props so that `label` cannot be
   * forgotten: it is the control's whole accessible name, other copy quotes
   * it verbatim (`removeLessonLabel`), and the default this replaced —
   * "Remove from module" — was a phrase no button ever actually wore, which
   * two other messages then went on to quote.
   */
  remove?: {
    /** Exact accessible name and tooltip. Must name the module. */
    label: string;
    onClick: () => void;
    /** Removal in flight: the control goes inert and says so. */
    isPending?: boolean;
  };
  /**
   * Delete the lesson itself, everywhere. High stakes and irreversible —
   * always behind a confirmation that names how many courses lose it.
   */
  onDelete?: () => void;
  /**
   * Why deleting is unavailable right now, when it is. Renders an inert
   * control carrying this as its accessible name instead of rendering
   * nothing: a control that silently vanishes is the locked-state-without-a-
   * reason this project does not ship. Ignored when `onDelete` is given.
   */
  deleteUnavailableReason?: string;
  /** Opens the preview modal. Omitted where there is nowhere to open it. */
  onPlay?: () => void;
  /**
   * The row of settings chips, as a node rather than data: the chips need a
   * mutation hook and this card must stay pure. Omitted by the drag overlay
   * and the module overlay's static list, where a ghost card has nothing to
   * edit — without it the card collapses back to its original single row.
   */
  quickshotSlot?: ReactNode;
}) => {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-sm text-primary">
      <LessonVideoTile
        hasVideo={lesson.isConfigured}
        lessonName={lesson.name}
        posterUrl={posterUrl}
        onPlay={onPlay}
      />
      {/* The tile spans both rows; everything else stacks beside it. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
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
          {remove && (
            <TooltipIconButton
              // A disabled control has to say why it is disabled, not just
              // grey out.
              label={
                remove.isPending ? `Removing ${lesson.name}…` : remove.label
              }
              onClick={remove.onClick}
              disabled={remove.isPending}
            >
              <CircleMinus className="h-4 w-4" aria-hidden="true" />
            </TooltipIconButton>
          )}
          {(onDelete || deleteUnavailableReason) && (
            <TooltipIconButton
              // Not "Delete": the word alone reads as a synonym of the remove
              // control beside it. This one ends the lesson everywhere.
              label={
                onDelete
                  ? 'Delete lesson everywhere'
                  : (deleteUnavailableReason as string)
              }
              onClick={onDelete}
              disabled={!onDelete}
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
        {quickshotSlot}
      </div>
    </div>
  );
};
