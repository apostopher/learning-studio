// `#/` not `@/`: this module is pure and sits beside `resolve-drop.ts`, which
// its test imports directly; keeping the alias consistent avoids a resolution
// trap the moment a test reaches for either.
import type {
  EditorBoardLesson,
  LibraryLesson,
  OrgEditorBoard,
  OrgLibrary,
} from '#/lib/admin-schemas';
import { parseDndId } from '#/lib/dnd-ids';

/**
 * The optimistic cache edits behind the editor's drags, kept pure and out of
 * the drag handlers. Each returns a NEW board; none mutates its input, so the
 * snapshot the container holds for rollback stays intact.
 */

/** Every module on the board, flattened — ids are unique across courses. */
function allModules(board: OrgEditorBoard) {
  return board.flatMap((cb) => cb.modules);
}

/**
 * Where in a module's lesson list a drop lands: a `lesson` over id names the
 * slot it takes, anything else appends.
 *
 * Read from the list as it stands NOW, before the dragged lesson is pulled
 * out of it — that is what makes a same-module downward move land in the slot
 * under the pointer rather than one above it.
 */
function overIndexIn(
  lessons: EditorBoardLesson[],
  overId: string | number,
): number {
  const over = parseDndId(overId);
  if (over?.type === 'lesson') {
    const at = lessons.findIndex((l) => l.id === over.id);
    if (at !== -1) return at;
  }
  return lessons.length;
}

function insertAt(
  board: OrgEditorBoard,
  lesson: EditorBoardLesson,
  targetModuleId: number,
  index: number,
): OrgEditorBoard {
  return board.map((cb) => ({
    ...cb,
    modules: cb.modules.map((m) => {
      if (m.id !== targetModuleId) return m;
      const lessons = [...m.lessons];
      lessons.splice(Math.min(index, lessons.length), 0, lesson);
      return { ...m, lessons };
    }),
  }));
}

/**
 * Move an already-placed lesson out of `fromModuleId` into `targetModuleId`
 * at `overId`'s slot.
 *
 * Stripped from exactly `fromModuleId` — the module currently showing the
 * dragged card — never from every module holding the lesson. A course can
 * show one lesson twice (its own module and a borrowed one), and stripping
 * by lesson id made the borrowed copy vanish from every column for the
 * length of the drag. Where the lesson sits during a drag is the caller's
 * to track; it starts as the pick-up module and advances on each live
 * transfer. A module appears in every column that shows it, so the strip
 * runs across all columns, keyed on the module id.
 */
export function moveLessonOnBoard(
  board: OrgEditorBoard,
  lessonId: number,
  fromModuleId: number,
  targetModuleId: number,
  overId: string | number,
): OrgEditorBoard {
  const target = allModules(board).find((m) => m.id === targetModuleId);
  if (!target) return board;
  const index = overIndexIn(target.lessons, overId);

  let moved: EditorBoardLesson | undefined;
  const stripped = board.map((cb) => ({
    ...cb,
    modules: cb.modules.map((m) => {
      if (m.id !== fromModuleId) return m;
      const at = m.lessons.findIndex((l) => l.id === lessonId);
      if (at === -1) return m;
      moved = m.lessons[at];
      return { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) };
    }),
  }));
  if (!moved) return board;

  return insertAt(stripped, moved, targetModuleId, index);
}

/** Append a newly linked library lesson to the end of a module. */
export function linkLessonOnBoard(
  board: OrgEditorBoard,
  lesson: EditorBoardLesson,
  targetModuleId: number,
): OrgEditorBoard {
  const target = allModules(board).find((m) => m.id === targetModuleId);
  if (!target) return board;
  // Appended, never inserted at the pointer's slot: the link route places the
  // lesson last (it takes no neighbours), so guessing a middle slot here would
  // show the admin a position the refetch is about to take away.
  return insertAt(board, lesson, targetModuleId, target.lessons.length);
}

/**
 * Reorder a module within the NAMED course's column only.
 *
 * A remixed module sits in two columns at once, so scanning every column
 * (as this used to) would try to reorder BOTH — usually a no-op on the
 * other column only because its sibling `overModuleId` does not happen to
 * live there too, which is luck, not a guarantee. `courseId` is the column
 * the drag actually happened in; every other column is left untouched.
 */
export function reorderModulesOnBoard(
  board: OrgEditorBoard,
  courseId: number,
  moduleId: number,
  overModuleId: number,
): OrgEditorBoard {
  return board.map((cb) => {
    if (cb.course.id !== courseId) return cb;
    const from = cb.modules.findIndex((m) => m.id === moduleId);
    const to = cb.modules.findIndex((m) => m.id === overModuleId);
    if (from === -1 || to === -1) return cb;
    const modules = [...cb.modules];
    const [moved] = modules.splice(from, 1);
    modules.splice(to, 0, moved);
    return { ...cb, modules };
  });
}

/** The lesson's neighbours in a module — the rank anchors the API wants. */
export function lessonNeighbours(
  board: OrgEditorBoard,
  moduleId: number,
  lessonId: number,
): { prevLessonId: number | null; nextLessonId: number | null } {
  const lessons =
    allModules(board).find((m) => m.id === moduleId)?.lessons ?? [];
  const at = lessons.findIndex((l) => l.id === lessonId);
  return {
    prevLessonId: lessons[at - 1]?.id ?? null,
    nextLessonId: lessons[at + 1]?.id ?? null,
  };
}

/**
 * The module's neighbours within the NAMED course's column — never another
 * column, even one also holding this module through a remix: rank is a
 * per-column concept, and the two columns' copies can have entirely
 * different neighbours.
 */
export function moduleNeighbours(
  board: OrgEditorBoard,
  courseId: number,
  moduleId: number,
): { prevModuleId: number | null; nextModuleId: number | null } {
  const cb = board.find((cb) => cb.course.id === courseId);
  if (!cb) return { prevModuleId: null, nextModuleId: null };
  const at = cb.modules.findIndex((m) => m.id === moduleId);
  if (at === -1) return { prevModuleId: null, nextModuleId: null };
  return {
    prevModuleId: cb.modules[at - 1]?.id ?? null,
    nextModuleId: cb.modules[at + 1]?.id ?? null,
  };
}

/**
 * What to persist when `resolveDrop` answers `null` for a lesson drag that
 * already moved something on screen.
 *
 * `null` normally means "dropped on nothing", and the right answer is to undo
 * the preview. But `onDragOver` transfers a lesson into its target module
 * live, and the transferred card is itself a droppable — so the release can
 * land on the dragged lesson's own id. `resolveDrop` correctly calls that a
 * self-drop and answers `null`, and rolling back there would silently undo a
 * transfer the admin watched happen and released on deliberately.
 *
 * `transferApplied` is the whole distinction: without it every `null` would
 * commit, and a genuine miss would persist a move nobody asked for.
 * `holderModuleId` is where the drag last carried the lesson — a drag that
 * wandered through three modules must persist where the lesson actually
 * ended up — and it is a tracked input rather than a search by lesson id,
 * which would land on the first of two copies of a duplicated lesson. The
 * board is still consulted: a holder that no longer shows the lesson means
 * the preview and the tracking disagree, and rolling back is the safe
 * answer.
 *
 * Returns the move to persist, or `null` to roll back.
 */
export function commitTransferredLesson(
  board: OrgEditorBoard,
  lessonId: number,
  holderModuleId: number,
  transferApplied: boolean,
): {
  targetModuleId: number;
  prevLessonId: number | null;
  nextLessonId: number | null;
} | null {
  if (!transferApplied) return null;
  const holder = allModules(board).find(
    (m) => m.id === holderModuleId && m.lessons.some((l) => l.id === lessonId),
  );
  if (!holder) return null;
  return {
    targetModuleId: holder.id,
    ...lessonNeighbours(board, holder.id, lessonId),
  };
}

/**
 * The board card to show for a library lesson the instant it is dropped,
 * before the refetch brings the real placement back.
 *
 * Every field the card draws comes from the library lesson. That includes the
 * four gates behind the quickshot chips, which this used to invent — the
 * comment here claimed the pane rendered no quickshot, and
 * `EditorLessonCardContainer` passes one, so a paid level-gated lesson landed
 * showing "Free" with an empty level chip and flipped a few hundred ms later.
 *
 * `rank: 0` and `quizQuestionCount: 0` are still placeholders, and both are
 * safe: rank is replaced by the refetch and never drawn, and the quiz count
 * feeds only the debrief warning's tooltip TEXT, never a chip's state.
 * `dependsOn: []` is correct rather than a placeholder — a lesson has no
 * prerequisites in a module it has just entered.
 */
export function boardLessonFromLibrary(
  lesson: LibraryLesson,
): EditorBoardLesson {
  return {
    id: lesson.id,
    name: lesson.name,
    slug: lesson.slug,
    rank: 0,
    isAvailable: lesson.isAvailable,
    isConfigured: lesson.isConfigured,
    hasDebrief: lesson.hasDebrief,
    needsVideoWatch: lesson.needsVideoWatch,
    requiredSubscriptions: lesson.requiredSubscriptions,
    levels: lesson.levels,
    quizQuestionCount: 0,
    dependsOn: [],
  };
}

/**
 * The library's own optimistic updaters — the same style as the course-side
 * ones above, applied to `OrgLibrary` instead of `OrgEditorBoard`.
 *
 * A dragged lesson is located by walking the library's own buckets (a
 * discipline's modules, then its own Untitled group), NEVER by trusting the
 * lesson's `disciplineModuleId` field — that field can go stale (its module
 * was deleted, say) while the payload has already re-bucketed the lesson
 * under Untitled. The field is an OUTPUT here (set on the moved lesson to
 * wherever it lands), never an input for finding anything.
 *
 * A move touches at most the discipline it leaves and the one it enters
 * (the same one for a move within a discipline; the org-level bag for the
 * two moves that change a lesson's discipline) — every other discipline is
 * returned untouched, at the same object reference, exactly as
 * `reorderModulesOnBoard` leaves every other course's column alone.
 */

/**
 * Where in a library bucket a drop lands: a `library-lesson` over id names
 * the slot it takes, anything else appends. Mirrors `overIndexIn`.
 */
function overIndexInLibrary(
  lessons: LibraryLesson[],
  overId: string | number,
): number {
  const over = parseDndId(overId);
  if (over?.type === 'library-lesson') {
    const at = lessons.findIndex((l) => l.id === over.id);
    if (at !== -1) return at;
  }
  return lessons.length;
}

/**
 * Move a library lesson into `disciplineId` (or the org-level Untitled bag
 * when null) at box `disciplineModuleId` (a discipline module's id, or null
 * for that discipline's own Untitled group — always null for the bag), at
 * `overId`'s slot.
 *
 * The destination discipline is explicit — it is what `resolveDrop` decided
 * — because it can differ from where the lesson currently sits: the bag is
 * how a lesson gains or loses its discipline. The lesson is pulled out of
 * WHEREVER it is found by walking every bucket (an earlier preview in the
 * same drag may already have re-bucketed it), never off its own (possibly
 * stale) `disciplineModuleId`.
 *
 * The insertion index is read from the target bucket AS IT STANDS NOW,
 * before the dragged lesson is pulled out of it — same reasoning as
 * `moveLessonOnBoard`: a same-bucket downward move must land in the slot
 * under the pointer, not one above it. The bag keeps no order, so a drop
 * into it appends.
 */
export function moveLessonInLibrary(
  library: OrgLibrary,
  lessonId: number,
  disciplineId: number | null,
  disciplineModuleId: number | null,
  overId: string | number,
): OrgLibrary {
  const destination =
    disciplineId === null
      ? null
      : (library.disciplines.find((d) => d.id === disciplineId) ?? null);
  if (disciplineId !== null && !destination) return library;

  const targetBucket =
    destination === null
      ? library.untitled
      : disciplineModuleId === null
        ? destination.untitled
        : (destination.modules.find((m) => m.id === disciplineModuleId)
            ?.lessons ?? []);
  const index = overIndexInLibrary(targetBucket, overId);

  // Strip the lesson from wherever it is.
  let moved: LibraryLesson | undefined;
  const take = (bucket: LibraryLesson[]): LibraryLesson[] => {
    const at = bucket.findIndex((l) => l.id === lessonId);
    if (at === -1) return bucket;
    moved = bucket[at];
    return bucket.filter((l) => l.id !== lessonId);
  };
  const strippedDisciplines = library.disciplines.map((d) => {
    const modules = d.modules.map((m) => {
      const lessons = take(m.lessons);
      return lessons === m.lessons ? m : { ...m, lessons };
    });
    const untitled = take(d.untitled);
    return modules.every((m, i) => m === d.modules[i]) &&
      untitled === d.untitled
      ? d
      : { ...d, modules, untitled };
  });
  const strippedBag = take(library.untitled);
  if (!moved) return library;

  const placed: LibraryLesson = { ...moved, disciplineModuleId };
  const insert = (bucket: LibraryLesson[]): LibraryLesson[] => {
    const next = [...bucket];
    next.splice(Math.min(index, next.length), 0, placed);
    return next;
  };

  if (destination === null) {
    return {
      ...library,
      disciplines: strippedDisciplines,
      untitled: insert(strippedBag),
    };
  }
  return {
    ...library,
    untitled: strippedBag,
    disciplines: strippedDisciplines.map((d) => {
      if (d.id !== destination.id) return d;
      if (disciplineModuleId === null) {
        return { ...d, untitled: insert(d.untitled) };
      }
      return {
        ...d,
        modules: d.modules.map((m) =>
          m.id === disciplineModuleId
            ? { ...m, lessons: insert(m.lessons) }
            : m,
        ),
      };
    }),
  };
}

/**
 * Reorder a discipline module within the NAMED discipline's shelf only —
 * every other discipline is returned untouched, at the same reference.
 *
 * When `moduleId`/`overModuleId` do not BOTH belong to `disciplineId` (the
 * two modules living in different disciplines, say), this is a true no-op:
 * the exact `library` argument is returned, not a structurally-identical
 * copy — the caller can tell "nothing changed" with `===`, the same way
 * `moveLessonInLibrary` answers a no-op with its own input.
 */
export function reorderLibraryModules(
  library: OrgLibrary,
  disciplineId: number,
  moduleId: number,
  overModuleId: number,
): OrgLibrary {
  const discipline = library.disciplines.find((d) => d.id === disciplineId);
  if (!discipline) return library;
  const from = discipline.modules.findIndex((m) => m.id === moduleId);
  const to = discipline.modules.findIndex((m) => m.id === overModuleId);
  if (from === -1 || to === -1) return library;

  const modules = [...discipline.modules];
  const [moved] = modules.splice(from, 1);
  modules.splice(to, 0, moved);

  return {
    ...library,
    disciplines: library.disciplines.map((d) =>
      d.id === disciplineId ? { ...discipline, modules } : d,
    ),
  };
}

/**
 * Where a library lesson is CURRENTLY shown, by walking the buckets in the
 * order the pane renders them — every discipline's modules, then its own
 * Untitled group, then the org-level Untitled column. Never read off the
 * card's own `disciplineModuleId`: that field is an OUTPUT of
 * `moveLessonInLibrary` and can go stale while the payload has already
 * re-bucketed the lesson (its module was deleted, say).
 */
function locateLibraryLesson(
  library: OrgLibrary,
  lessonId: number,
): {
  bucket: LibraryLesson[];
  at: number;
  disciplineId: number | null;
  boxId: number | null;
} | null {
  for (const d of library.disciplines) {
    for (const m of d.modules) {
      const at = m.lessons.findIndex((l) => l.id === lessonId);
      if (at !== -1)
        return { bucket: m.lessons, at, disciplineId: d.id, boxId: m.id };
    }
    const at = d.untitled.findIndex((l) => l.id === lessonId);
    if (at !== -1)
      return { bucket: d.untitled, at, disciplineId: d.id, boxId: null };
  }
  const at = library.untitled.findIndex((l) => l.id === lessonId);
  if (at !== -1)
    return { bucket: library.untitled, at, disciplineId: null, boxId: null };
  return null;
}

/**
 * The box a library lesson sits in: its discipline and module, `boxId: null`
 * for that discipline's own Untitled group, `disciplineId: null` for the
 * org-level Untitled column, and `null` for a lesson the library does not
 * show at all. What `onDragOver` compares a `library-move`'s target box
 * against: a hover within the lesson's CURRENT box is the sortable's to
 * animate and gets no live write — written live, the card and the sibling
 * it displaced would swap back on the next pointer move over unequal card
 * heights — while a cross-box hover is carried over live.
 */
export function libraryLessonBox(
  library: OrgLibrary,
  lessonId: number,
): { disciplineId: number | null; boxId: number | null } | null {
  const located = locateLibraryLesson(library, lessonId);
  if (!located) return null;
  return { disciplineId: located.disciplineId, boxId: located.boxId };
}

/** The library lesson's neighbours in whichever bucket holds it — a
 *  discipline module's lessons, a discipline's own Untitled group, or the
 *  org-level Untitled column. A lesson no bucket holds has no neighbours —
 *  never `bucket[0]` off an index of -1. */
export function libraryLessonNeighbours(
  library: OrgLibrary,
  lessonId: number,
): { prevLessonId: number | null; nextLessonId: number | null } {
  const located = locateLibraryLesson(library, lessonId);
  if (!located) return { prevLessonId: null, nextLessonId: null };
  const { bucket, at } = located;
  return {
    prevLessonId: bucket[at - 1]?.id ?? null,
    nextLessonId: bucket[at + 1]?.id ?? null,
  };
}

/** The discipline module's neighbours within the NAMED discipline's shelf
 *  only — never another discipline. */
export function libraryModuleNeighbours(
  library: OrgLibrary,
  disciplineId: number,
  moduleId: number,
): { prevModuleId: number | null; nextModuleId: number | null } {
  const discipline = library.disciplines.find((d) => d.id === disciplineId);
  if (!discipline) return { prevModuleId: null, nextModuleId: null };
  const at = discipline.modules.findIndex((m) => m.id === moduleId);
  if (at === -1) return { prevModuleId: null, nextModuleId: null };
  return {
    prevModuleId: discipline.modules[at - 1]?.id ?? null,
    nextModuleId: discipline.modules[at + 1]?.id ?? null,
  };
}
