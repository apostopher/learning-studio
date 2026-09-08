import { atom } from 'jotai';
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
 * What the schedule dialog is currently doing, or null when it is closed.
 *
 * One atom for both modes rather than two, because they are the same dialog
 * and the states are mutually exclusive — as separate atoms, "creating" and
 * "editing" could both be set and the dialog would have to pick a winner.
 *
 * `create` carries the drop: the course that was dragged and the day it
 * landed on. The start date is therefore decided by the gesture and shown
 * read-only in the dialog — making it editable there would mean the drop
 * decided nothing.
 */
export type ScheduleDialogState =
  | { mode: 'create'; courseId: number; courseName: string; startsOn: string }
  | { mode: 'edit'; offeringId: number }
  | null;

export const scheduleDialogAtom = atom<ScheduleDialogState>(null);
