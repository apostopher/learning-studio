import { Tooltip } from '@base-ui/react/tooltip';
import {
  CircleMinus,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { BoardLesson } from '#/lib/admin-schemas';
import { ClampedText } from '../clamped-text';
import { Chip, chipClassName } from '../ui/chip';
import {
  IconButtonTooltip,
  TooltipIconButton,
} from '../ui/tooltip-icon-button';
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
  alsoIn,
  visibility,
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
  /**
   * Names of the OTHER modules in this course that also hold this lesson —
   * whole-course remixing makes teaching a lesson twice common, and the spec
   * says to surface that, not block it. Omitted or empty draws nothing.
   */
  alsoIn?: string[];
  /**
   * Publish or draft the lesson from the card. Replaces the Draft label with
   * an eye button that says what a click will do. Omitted on read-only cards
   * (drag overlay, borrowed lists), which keep the Draft label in words.
   */
  visibility?: {
    onToggle: () => void;
    /** Save in flight: the eye goes inert and says so. */
    isPending?: boolean;
  };
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
    // the whole card — a mouse click on Edit would otherwise leave the
    // outline stuck on until blur.
    <div className="flex items-center gap-2 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-sm text-primary outline outline-2 outline-offset-0 outline-transparent transition-[outline-color,background-color] duration-150 hover:bg-gray-2 hover:outline-warning-9 has-focus-visible:outline-warning-9">
      <LessonVideoTile
        hasVideo={lesson.isConfigured}
        lessonName={lesson.name}
        posterUrl={posterUrl}
        onPlay={onPlay}
      />
      {/* The tile spans both rows; everything else stacks beside it. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* The name gets the whole line; it used to share it with the
            label and four icons and clamped long before it needed to. */}
        <ClampedText text={lesson.name} className="min-w-0" />
        <div className="flex items-center justify-end gap-2">
          {visibility ? (
            <TooltipIconButton
              label={
                visibility.isPending
                  ? `Updating visibility of ${lesson.name}…`
                  : lesson.isAvailable
                    ? 'Visible to students. Hide it'
                    : 'Hidden from students. Show it'
              }
              onClick={visibility.onToggle}
              disabled={visibility.isPending}
            >
              {lesson.isAvailable ? (
                <Eye className="h-4 w-4" aria-hidden="true" />
              ) : (
                // Tinted: a crossed eye says less than the word "Draft"
                // did, so the draft state carries colour to stay noticed.
                <EyeOff
                  className="h-4 w-4 text-warning-text"
                  aria-hidden="true"
                />
              )}
            </TooltipIconButton>
          ) : (
            /*
              Replaces the status dot the tile took over from. The dot was
              `aria-hidden`, so published/draft was invisible to a screen
              reader and the board had no other cue; a word is legible to
              everyone and, since most lessons end up published, is absent
              most of the time. Kept for read-only cards with no eye.
            */
            !lesson.isAvailable && (
              <span className="shrink-0 rounded bg-gray-4 px-1.5 py-0.5 font-medium text-tertiary text-xs">
                Draft
              </span>
            )
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
          {/* A card with no drag handle is read-only (e.g. a borrowed
              module's `BorrowedLessonList`) — a grip that does nothing
              promises a drag the card refuses. */}
          {dragHandleProps && (
            <button
              type="button"
              aria-label="Drag to reorder lesson"
              {...dragHandleProps}
              className="-me-1 shrink-0 cursor-grab rounded p-1 text-tertiary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 active:cursor-grabbing"
            >
              <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        {alsoIn && alsoIn.length > 0 && (
          <Chip tone="soft-apple">Also in {alsoIn.join(', ')}</Chip>
        )}
        {quickshotSlot && (
          <div className="flex flex-wrap items-center gap-1.5">
            {quickshotSlot}
            <VersionChip />
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Placeholder for the lesson-version flag (design 2026-11-19): gold once
 * versioning exists will mean "a newer version is in Disciplines". Until
 * then it is inert and says so — `aria-disabled` rather than `disabled`
 * because Base UI's Tooltip.Trigger swallows the native attribute, and no
 * handler at all, so neither a click nor Enter does anything.
 */
const VersionChip = () => (
  // Closes as soon as the pointer leaves — see `tooltip-icon-button.tsx`.
  <Tooltip.Root disableHoverablePopup>
    <Tooltip.Trigger
      render={<button type="button" />}
      aria-disabled="true"
      aria-label="Ver: lesson versions are coming soon"
      className={chipClassName(
        'solid-accent',
        'cursor-not-allowed focus-visible:outline-2 focus-visible:outline-apple-9 focus-visible:outline-offset-2',
      )}
    >
      Ver
    </Tooltip.Trigger>
    <IconButtonTooltip label="Ver: lesson versions are coming soon" />
  </Tooltip.Root>
);
