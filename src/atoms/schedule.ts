import { atom } from 'jotai';
import {
  CLOSED,
  type OfferingPopoverEvent,
  type OfferingPopoverState,
  reduceOfferingPopover,
} from '#/components/admin/schedule/offering-popover-state';
import type { PopoverAnchor } from '#/components/admin/schedule/popover-anchor';
import { calendarWindowStart } from '#/components/calendar';

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
