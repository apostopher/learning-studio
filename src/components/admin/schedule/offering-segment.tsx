import { cn } from '#/lib/cn';

/**
 * One day of an offering, drawn inside a calendar cell.
 *
 * An offering spanning three weeks is not one element stretched across the
 * grid — it is one of these on each of its days. That is what lets a run wrap
 * at the end of a week, and it is why the calendar itself takes no view on
 * spans (see `Calendar`'s doc comment).
 *
 * Only the FIRST day carries the caption. Repeating the course name on all
 * twenty-one days would make a busy month unreadable, and the caption is
 * allowed to overflow its cell so it can run across the days the offering
 * already covers — the plain blocks that follow have nothing in them for it
 * to collide with.
 */
export const OfferingSegment = ({
  label,
  tone,
  isStart,
  isEnd,
  isContinuation,
  headcount,
  accessibleName,
  onClick,
}: {
  /** Course name and dates, shown on the first day only. */
  label: string;
  /** Background + matching contrast text, from `offeringTone`. */
  tone: string;
  isStart: boolean;
  isEnd: boolean;
  /**
   * The offering began BEFORE the visible window and this is the first day on
   * screen. It gets the caption too — a bar with no beginning otherwise says
   * nothing about what it is or when it started.
   */
  isContinuation: boolean;
  /** How many people are on it. Shown with the caption. */
  headcount: number;
  /**
   * The full spoken name for THIS day's segment, e.g.
   * "2 Week, 7 Sep to 20 Sep 2026, 12 people. Day 3 of 14."
   *
   * Every day of an offering is a live click target — a bar you can see but
   * cannot click on the day you happen to aim at is a dead control — so every
   * day is a button and every button needs its own name. The visible caption
   * is `aria-hidden` because it appears on one day only and would otherwise
   * leave the other twenty announcing nothing.
   */
  accessibleName: string;
  onClick: () => void;
}) => {
  const carriesLabel = isStart || isContinuation;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={accessibleName}
      className={cn(
        'relative flex h-5 w-full items-center gap-1.5 px-1 font-mono text-xs',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-12 focus-visible:ring-inset',
        tone,
        // The caption is wider than one column, so on the day it appears it
        // runs across the days the offering already covers. `z-[1]` keeps it
        // above the plain blocks that follow, which are painted later.
        carriesLabel
          ? 'z-[1] justify-start overflow-visible whitespace-nowrap'
          : 'justify-start overflow-hidden',
        // A darker edge on the true start, so a run that merely continues onto
        // this screen cannot be mistaken for one starting here.
        isStart && 'rounded-s-sm border-black/30 border-s-[3px]',
        isContinuation &&
          'rounded-s-sm border-white/50 border-s-[3px] border-dashed',
        isEnd && 'rounded-e-sm border-black/30 border-e-[3px]',
      )}
    >
      {carriesLabel && (
        <span
          aria-hidden="true"
          className="flex items-center gap-1.5 overflow-visible"
        >
          {isContinuation && <span>‹</span>}
          <span className="font-semibold">{label}</span>
          <span className="opacity-80">
            {headcount} {headcount === 1 ? 'person' : 'people'}
          </span>
        </span>
      )}
    </button>
  );
};
