// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import type { DndType } from '#/lib/dnd-ids';

/**
 * Which droppables a dragged MODULE is allowed to collide with.
 *
 * Not just other modules, and that is the whole reason this is a named,
 * tested function rather than an inline predicate. Filtered to `module` alone
 * — as the editor did — a module dragged onto a library column or an empty
 * course produced `over === null`, so the drag sprang back with no note, no
 * screen-reader announcement and no toast. `resolveDrop` has a written
 * refusal for both of those drops; both were unreachable, and both of their
 * tests passed, because a whitelist that never offers the target is
 * indistinguishable from one that refuses it.
 *
 * A refusal has to be REACHABLE to be a refusal. Every type here is one
 * `resolveDrop` answers for by name.
 */
export function acceptsModuleDrag(type: DndType | undefined): boolean {
  return type === 'module' || type === 'discipline' || type === 'course';
}

/**
 * Which droppables a dragged LESSON — placed or from the library — may
 * collide with.
 *
 * `discipline` is handled separately by the caller, which drops the column a
 * library card came from: releasing a card back where it started is "never
 * mind", not a mistake, and answering it with a red refusal would make the
 * universal cancel gesture look like an error.
 */
export function acceptsLessonDrag(type: DndType | undefined): boolean {
  return type === 'lesson' || type === 'container' || type === 'course';
}

/**
 * The AREA targets in the collision pass's first stage — the regions a
 * pointer can be inside, as opposed to the individual cards nested within
 * them. A module's droppable wraps its whole item, so it would otherwise win
 * `closestCorners` against the smaller lesson cards inside it and every drop
 * would append instead of landing in the slot under the cursor.
 */
export function isAreaTarget(type: DndType | undefined): boolean {
  return type === 'container' || type === 'discipline' || type === 'course';
}
