import { CircleMinus, Eye, EyeOff, GripVertical, Pencil } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { BoardLesson } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { ClampedText } from '../clamped-text';
import { Chip } from '../ui/chip';
import { TooltipIconButton } from '../ui/tooltip-icon-button';
import { visibilityLabel } from './lesson-card-labels';
import { LessonVideoTile } from './lesson-video-tile';
import { VersionChip, type VersionChipProps } from './version-chip';

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
  onConfigure,
  remove,
  onPlay,
  quickshotSlot,
  version,
  alsoIn,
  visibility,
}: {
  lesson: LessonCardLesson;
  /** Poster frame for this lesson's video, when its provider exposes one. */
  posterUrl?: string | null;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  /** Opens the lesson's settings in this course; its content is Disciplines'. */
  onConfigure?: () => void;
  /**
   * Take this lesson out of the module it is sitting in — a placement is
   * deleted, the lesson survives. A different act from deleting the lesson
   * (library only), which is why it is neutral, not danger, and worded to
   * name the module.
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
   * The version this course is on, as the last chip of that row. On every card
   * in a course, borrowed ones too; omitted by the drag overlays.
   */
  version?: VersionChipProps;
  /**
   * Names of the OTHER modules in this course that also hold this lesson —
   * whole-course remixing makes teaching a lesson twice common, and the spec
   * says to surface that, not block it. Omitted or empty draws nothing.
   */
  alsoIn?: string[];
  /**
   * Show the lesson to the course's students, or hide it, with an eye button
   * that says what a click will do. Omitted on read-only cards (drag overlay,
   * borrowed lists), which say Hidden in words.
   */
  visibility?: {
    onToggle: () => void;
    /** Save in flight: the eye goes inert and says so. */
    isPending?: boolean;
    /** How many other courses borrow the module: the eye answers for them too. */
    sharedWith?: number;
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
    // the whole card — a mouse click on one would otherwise leave the
    // outline stuck on until blur.
    <div className="flex items-center gap-2 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-sm text-primary outline outline-2 outline-offset-0 outline-transparent transition-[outline-color,background-color] duration-150 hover:bg-gray-2 hover:outline-warning-9 has-focus-visible:outline-warning-9">
      <LessonVideoTile
        hasVideo={lesson.isConfigured}
        lessonName={lesson.name}
        posterUrl={posterUrl}
        onPlay={onPlay}
      />
      {/* The tile spans both rows; everything else stacks beside it.
          A grid, not a column: the grip gets its own trailing column so the
          action icons and the chip row both end at the same edge and line up without a magic offset. */}
      <div
        className={cn(
          'grid min-w-0 flex-1 gap-y-1.5',
          dragHandleProps
            ? 'grid-cols-[minmax(0,1fr)_auto] gap-x-2'
            : 'grid-cols-[minmax(0,1fr)]',
        )}
      >
        {/* The name gets the whole line; it used to share it with the
            label and four icons and clamped long before it needed to. */}
        <ClampedText text={lesson.name} className="col-span-full min-w-0" />
        <div className="flex items-center justify-end gap-2">
          {visibility ? (
            <TooltipIconButton
              label={
                visibility.isPending
                  ? `Updating visibility of ${lesson.name}…`
                  : visibilityLabel(lesson.isAvailable, visibility.sharedWith)
              }
              onClick={visibility.onToggle}
              disabled={visibility.isPending}
            >
              {lesson.isAvailable ? (
                <Eye className="h-4 w-4" aria-hidden="true" />
              ) : (
                // Tinted: a crossed eye says less than a word, so the hidden
                // state carries colour to stay noticed.
                <EyeOff
                  className="h-4 w-4 text-warning-text"
                  aria-hidden="true"
                />
              )}
            </TooltipIconButton>
          ) : (
            /*
              Replaces the status dot the tile took over from. The dot was
              `aria-hidden`, so shown/hidden was invisible to a screen
              reader and the board had no other cue; a word is legible to
              everyone and, since most lessons end up shown, is absent
              most of the time. Kept for read-only cards with no eye.
            */
            !lesson.isAvailable && (
              <span className="shrink-0 rounded bg-gray-4 px-1.5 py-0.5 font-medium text-tertiary text-xs">
                Hidden
              </span>
            )
          )}
          {onConfigure && (
            <TooltipIconButton label="Configure lesson" onClick={onConfigure}>
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
        </div>
        {/* A card with no drag handle is read-only (e.g. a borrowed
            module's `BorrowedLessonList`) — a grip that does nothing
            promises a drag the card refuses. */}
        {dragHandleProps && (
          <button
            type="button"
            aria-label="Drag to reorder lesson"
            {...dragHandleProps}
            className="-me-1 shrink-0 cursor-grab self-center rounded p-1 text-tertiary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        {alsoIn && alsoIn.length > 0 && (
          <Chip tone="soft-apple" className="col-start-1 justify-self-start">
            Also in {alsoIn.join(', ')}
          </Chip>
        )}
        {(quickshotSlot || version) && (
          // Right-aligned so the last chip ends under the last icon. `pe-1.5`
          // is the icon button's own inset ((28px box − 16px glyph) / 2), so
          // the chip lines up with the icon you see, not its hit area.
          <div className="col-start-1 flex flex-wrap items-center justify-end gap-1.5 pe-1.5">
            {quickshotSlot}
            {version && <VersionChip {...version} />}
          </div>
        )}
      </div>
    </div>
  );
};
