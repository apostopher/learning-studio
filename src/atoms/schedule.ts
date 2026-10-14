import { atom } from 'jotai';
import {
  CLOSED,
  type OfferingPopoverEvent,
  type OfferingPopoverState,
  reduceOfferingPopover,
} from '#/components/admin/schedule/offering-popover-state';
import type { PopoverAnchor } from '#/components/admin/schedule/popover-anchor';
import { calendarWindowStart } from '#/components/calendar';
import type { UserLevel } from '#/types';

/**
 * The first week drawn by the schedule calendar.
 *
 * Opens two weeks behind the current week, not on it: an offering already
 * under way would otherwise begin above the top edge, with nothing on screen
 * saying when it started.
 *
 * A plain atom rather than component state because the rail, the header
 * caption and the query key all read the same window — a component owning it
 * would make itself the source of truth for its siblings.
 */
export const scheduleWindowStartAtom = atom(
  calendarWindowStart(new Date(), { weeksBefore: 2 }),
);

/** How many weeks the grid shows at once. */
export const SCHEDULE_WEEKS = 10;
/** How far the header's arrows move. */
export const SCHEDULE_STEP_WEEKS = 4;

/**
 * The offering popover's state — closed, previewing on hover, or pinned for
 * editing. Written only through `dispatchOfferingPopoverAtom` so every change
 * passes the reducer's rules.
 */
export const offeringPopoverAtom = atom<OfferingPopoverState>(CLOSED);

export const dispatchOfferingPopoverAtom = atom(
  null,
  (get, set, event: OfferingPopoverEvent) => {
    set(
      offeringPopoverAtom,
      reduceOfferingPopover(get(offeringPopoverAtom), event),
    );
  },
);

/**
 * Where the offering popover points. Its OWN atom, apart from
 * `offeringPopoverAtom`, because a preview follows the mouse: pointermove
 * writes here ~60 times a second, and only the positioner reads it — the form
 * inside the popover must not re-render on every pixel.
 */
export const offeringPopoverAnchorAtom = atom<PopoverAnchor | null>(null);

/**
 * Where focus goes when the offering popover closes. Set by the page ONLY
 * when a popover is pinned from the keyboard (the segment it came from), and
 * read-and-cleared by the popover's `finalFocus`. Null means "leave focus
 * where the user put it" — the mouse and drop cases.
 */
export const offeringPopoverReturnFocusAtom = atom<HTMLElement | null>(null);

/**
 * The element `finalFocus` is about to focus, one-shot. After a keyboard pin
 * the browser treats that scripted focus as `:focus-visible` (the last input
 * was a key), so without this the segment's onFocus would re-preview the
 * offering the user just closed. The page reads-and-clears it in onFocus.
 */
export const offeringPopoverSuppressFocusPreviewAtom = atom<HTMLElement | null>(
  null,
);

/**
 * A roster level chosen with the chip but not yet settled: pressed and
 * waiting on the debounce, and/or being saved. Keyed by `rosterLevelEditKey`
 * — course and person, not offering: a level belongs to the person in a
 * course, so the same person on two offerings of one course is ONE level,
 * with one queue of saves. An entry is removed once nothing is waiting,
 * sending or queued, and the chip falls back to the roster row's own
 * (saved) level.
 */
export type RosterLevelEdit = {
  /**
   * The offering the latest press was on (null while scheduling a new one).
   * Only for the patch guard: a save patches the roster on screen only if it
   * is still this one.
   */
  offeringId: number | null;
  courseId: number;
  courseName: string;
  userId: string;
  profileId: number;
  name: string;
  /** What the chip shows, and what the next save writes. */
  level: UserLevel;
  /**
   * The level known to be saved: the roster row's own when the edit began,
   * then each level a save confirmed. A save of this level is skipped — no
   * redundant write, no second pilot message for the same level.
   */
  saved: UserLevel | null;
  /** The debounced save, while one is waiting. */
  timer: ReturnType<typeof setTimeout> | null;
  /**
   * The level being saved right now, or null. One save per row at a time:
   * two concurrent PUTs could land out of order, and each one messages the
   * pilot.
   */
  sending: UserLevel | null;
  /**
   * A save came due (debounce or flush) while one was sending. When that one
   * settles, `level` is sent once — if it differs from what just went.
   */
  queued: boolean;
};

export const rosterLevelEditKey = (courseId: number, userId: string) =>
  `${courseId}:${userId}`;

export const rosterLevelEditsAtom = atom<Record<string, RosterLevelEdit>>({});
