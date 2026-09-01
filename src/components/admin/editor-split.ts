/**
 * How far the editor's splitter may travel.
 *
 * Neither pane's floor is a percentage: both hold `w-96` columns, so "20% of
 * the editor" is a usable library on a wide monitor and half a column on a
 * laptop. The floor for each side is therefore ONE of its
 * own columns plus the gutter its row already puts on both sides — drag past
 * that and the column is clipped, which is the state these bounds exist to
 * make unreachable.
 *
 * The numbers are duplicated from Tailwind classes that live on the column
 * components, which no test can read from here. `editor-split.test.ts`
 * therefore renders those components and asserts the classes still match, so
 * changing the width on either column fails a test that names this file
 * rather than silently drifting. That guard has already earned itself once:
 * it caught this constant when `DisciplineColumn` went from `w-80` to `w-96`.
 */

/**
 * `w-96` on `DisciplineColumn` — the same width as a course column, so the
 * two panes read as one system rather than two sizes of card.
 */
export const LIBRARY_COLUMN_WIDTH_PX = 384;
/** `w-96` on `CourseColumn`. */
export const COURSE_COLUMN_WIDTH_PX = 384;
/** `p-4` on each pane's columns row — one gutter at each edge. */
export const PANE_GUTTER_PX = 16;
/** `w-1.5` on `EditorPaneSplitter`, which sits between the two panes. */
export const SPLITTER_WIDTH_PX = 6;

/** One discipline column with an equal gutter either side. */
export const LIBRARY_MIN_WIDTH_PX =
  LIBRARY_COLUMN_WIDTH_PX + PANE_GUTTER_PX * 2;
/** One course column with an equal gutter either side. */
export const COURSE_RAIL_MIN_WIDTH_PX =
  COURSE_COLUMN_WIDTH_PX + PANE_GUTTER_PX * 2;

export interface SplitBounds {
  /** Smallest library share, as a percentage of the whole editor row. */
  min: number;
  max: number;
}

/**
 * The percentage range the library pane may occupy, for a row of this width.
 *
 * Pure, and takes the width as an argument rather than measuring, because the
 * arithmetic is the part worth testing and a function that reached for the DOM
 * could not be.
 *
 * Below `0`, or a row not yet measured, the handle is unconstrained: a bound
 * computed from a width of zero would be nonsense, and refusing to move is a
 * worse answer than moving freely for the one frame before the observer
 * reports.
 */
export function splitBounds(rowWidth: number): SplitBounds {
  if (!Number.isFinite(rowWidth) || rowWidth <= 0) return { min: 0, max: 100 };

  const min = (LIBRARY_MIN_WIDTH_PX / rowWidth) * 100;
  const max =
    ((rowWidth - SPLITTER_WIDTH_PX - COURSE_RAIL_MIN_WIDTH_PX) / rowWidth) *
    100;

  if (min > max) {
    // The row cannot satisfy both floors at once. Rather than let one pane
    // win — the library, if `min` simply took precedence — freeze the handle
    // at the ratio of the two minimums, so each side is squeezed in
    // proportion to what it actually needs. There is genuinely nothing to
    // drag at this width, and a handle that moves without changing anything
    // is worse than one that holds still.
    const share =
      (LIBRARY_MIN_WIDTH_PX /
        (LIBRARY_MIN_WIDTH_PX + COURSE_RAIL_MIN_WIDTH_PX)) *
      100;
    return { min: share, max: share };
  }

  return { min, max };
}

/** Hold `percent` inside `bounds`. */
export function clampSplit(percent: number, bounds: SplitBounds): number {
  if (!Number.isFinite(percent)) return bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, percent));
}
