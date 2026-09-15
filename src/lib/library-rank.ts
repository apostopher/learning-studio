/**
 * ONE effective `library_rank` for a lesson, shared by the writer that
 * assigns ranks (`placeLessonInLibrary`) and the reader that sorts by them
 * (`getOrgLibrary`).
 *
 * A lesson is unranked (`library_rank` NULL) until it is first dragged, and
 * every lesson that predates this feature is unranked. Both sides must agree
 * on where an unranked lesson stands, or a rank computed against unranked
 * neighbours lands somewhere the admin did not put it: a writer that
 * coalesced an unranked neighbour to 0 while the reader sorted unranked
 * lessons LAST handed a drop "after C" rank 1 — and the refetch sorted it
 * before every unranked sibling, at the top of the box.
 *
 * The shared rule: an unranked lesson stands at `OFFSET + id`. The offset
 * keeps every unranked lesson after every explicitly ranked one (ranks start
 * at 1 and move by midpoints, so they stay far below 1e9), and `+ id` keeps
 * unranked lessons in id order among themselves — the order the reader
 * showed before any drag. Nothing is backfilled: the rule is applied on read
 * and on write, never written to rows that were not dragged.
 */
export const LIBRARY_RANK_OFFSET = 1_000_000_000;

/** Where an unranked (never dragged) lesson stands. */
export function unrankedLibraryRank(lessonId: number): number {
  return LIBRARY_RANK_OFFSET + lessonId;
}

/** A lesson's stored rank, or its unranked position. */
export function effectiveLibraryRank(lesson: {
  id: number;
  libraryRank: number | null;
}): number {
  return lesson.libraryRank ?? unrankedLibraryRank(lesson.id);
}

/** Effective rank ascending, then id — the order a box is shown in. */
export function byLibraryOrder(
  a: { id: number; libraryRank: number | null },
  b: { id: number; libraryRank: number | null },
): number {
  return effectiveLibraryRank(a) - effectiveLibraryRank(b) || a.id - b.id;
}
