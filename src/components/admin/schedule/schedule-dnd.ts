/**
 * Namespaced dnd-kit identifiers for the schedule board.
 *
 * Its own id space, deliberately separate from `#/lib/dnd-ids`: that module
 * is the editor's, and every id in it ends in a NUMBER (`parseDndId` splits
 * on the last hyphen and coerces). A day's identity here is a `yyyy-MM-dd`
 * key, which would parse to NaN there and silently return null. Two boards,
 * two id schemes, no shared parser to keep honest.
 */

const COURSE_PREFIX = 'schedule-course-';
const DAY_PREFIX = 'schedule-day-';

/** A course card in the rail — the thing being dragged. */
export const scheduleCourseDndId = (courseId: number) =>
  `${COURSE_PREFIX}${courseId}`;

/** A day cell in the grid — the thing being dropped on. */
export const scheduleDayDndId = (dayKey: string) => `${DAY_PREFIX}${dayKey}`;

export function parseScheduleCourseDndId(id: string | number): number | null {
  const raw = String(id);
  if (!raw.startsWith(COURSE_PREFIX)) return null;
  const suffix = raw.slice(COURSE_PREFIX.length);
  // Matched as digits before being coerced. `Number('')` is 0, not NaN, so an
  // id with its number missing entirely used to parse as course 0 and look
  // like a real hit — `Number.isInteger` cannot tell those apart.
  if (!/^\d+$/.test(suffix)) return null;
  const courseId = Number(suffix);
  return courseId > 0 ? courseId : null;
}

export function parseScheduleDayDndId(id: string | number): string | null {
  const raw = String(id);
  if (!raw.startsWith(DAY_PREFIX)) return null;
  const key = raw.slice(DAY_PREFIX.length);
  // Validated rather than trusted: this string goes on to become an
  // offering's `startsOn`, and a malformed one would reach the API.
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

/**
 * The colour an offering's bars are drawn in.
 *
 * Chosen by offering id so a colour belongs to the offering rather than to
 * its position: unscheduling one never recolours the rest, which is what
 * makes a bar matchable against the rail across half a screen.
 *
 * Every pair is solid step 9 with its own `-contrast` token, measured at 5.5:1
 * or better in BOTH themes. `error` is deliberately absent — a course running
 * in October is not a failure — and so is `gray`, which reads as disabled.
 */
const OFFERING_TONES = [
  'bg-apple-9 text-apple-contrast',
  'bg-gold-9 text-gold-contrast',
  'bg-success-9 text-success-contrast',
  'bg-warning-9 text-warning-contrast',
  'bg-link-9 text-link-contrast',
] as const;

export const offeringTone = (offeringId: number): string =>
  OFFERING_TONES[offeringId % OFFERING_TONES.length];
