// `#/` not `@/`: this module is pure and sits beside `resolve-drop.ts`, which
// its test imports directly; keeping the alias consistent avoids a resolution
// trap the moment a test reaches for either.
import type { OrgLibrary } from '#/lib/admin-schemas';
import { parseDndId } from '#/lib/dnd-ids';
import {
  libraryLessonNeighbours,
  libraryModuleNeighbours,
} from './editor-board-updates';
import type { DropResolution } from './resolve-drop';

/** The two `DropResolution` kinds a library-side drag can settle into. */
export type LibraryDropResolution = Extract<
  DropResolution,
  { kind: 'library-move' | 'reorder-library-module' }
>;

export type LibraryCommit =
  | {
      kind: 'place';
      vars: {
        lessonId: number;
        /** Destination discipline; null releases the lesson to the org-level Untitled bag. */
        disciplineId: number | null;
        disciplineModuleId: number | null;
        prevLessonId: number | null;
        nextLessonId: number | null;
      };
    }
  | {
      kind: 'reorder';
      vars: {
        moduleId: number;
        prevModuleId: number | null;
        nextModuleId: number | null;
      };
    };

/**
 * The mutation a library drop turns into, read off the PREVIEWED library
 * (after the optimistic update), so the neighbours sent to the server are
 * the ones the admin saw the lesson land between. Pure, so the container
 * stays a thin relay and this decision has a test.
 */
export function commitLibraryDrop(
  resolution: LibraryDropResolution,
  previewed: OrgLibrary,
): LibraryCommit {
  if (resolution.kind === 'library-move') {
    return {
      kind: 'place',
      vars: {
        lessonId: resolution.lessonId,
        disciplineId: resolution.disciplineId,
        disciplineModuleId: resolution.disciplineModuleId,
        // The bag keeps no order, so a release names no neighbours — the
        // server clears the rank rather than computing one.
        ...(resolution.disciplineId === null
          ? { prevLessonId: null, nextLessonId: null }
          : libraryLessonNeighbours(previewed, resolution.lessonId)),
      },
    };
  }
  return {
    kind: 'reorder',
    vars: {
      moduleId: resolution.moduleId,
      ...libraryModuleNeighbours(
        previewed,
        resolution.disciplineId,
        resolution.moduleId,
      ),
    },
  };
}

/**
 * The last library-side preview `onDragOver` actually applied to the cache —
 * only what's needed to rebuild a `DropResolution` from it later, not the
 * ever-changing `overId`/`overModuleId` of whatever is being hovered right
 * now. Held by the container in a `useRef`, set whenever `moveLessonInLibrary`
 * / `reorderLibraryModules` runs, and cleared at the start of each new drag.
 */
export type LibraryPreview =
  | {
      kind: 'library-move';
      lessonId: number;
      disciplineId: number | null;
      disciplineModuleId: number | null;
    }
  | { kind: 'reorder-library-module'; disciplineId: number; moduleId: number };

/**
 * Rebuilds the `DropResolution` a live library preview represents, for the
 * moment a drag is released exactly on its own already-relocated card.
 *
 * `onDragOver` carries a library-lesson (or a reordered library-module) to
 * its new position live, by writing straight into the library query's cache
 * — the same trick the course rail uses for a cross-module lesson move. The
 * dragged card re-registers at that new position, so the release can land on
 * the dragged item's OWN id: a self-drop, which `resolveDrop` correctly
 * answers `null` for (active and over now name the same card). Without this,
 * that `null` would roll back a move the admin just watched happen — the
 * exact failure `commitTransferredLesson` exists to prevent on the rail.
 *
 * Matched by id, not merely by kind: a stale preview left over from an
 * earlier hover (or, in principle, an unrelated drag) must not be replayed
 * against a different card. Returns `null` when there is no preview, the
 * active id does not parse, or it names a different lesson/module than the
 * preview carried.
 */
export function libraryDropFromPreview(
  preview: LibraryPreview | null,
  activeId: string | number,
  overId: string | number,
): LibraryDropResolution | null {
  if (!preview) return null;
  const active = parseDndId(activeId);
  if (!active) return null;
  if (
    preview.kind === 'library-move' &&
    active.type === 'library-lesson' &&
    active.id === preview.lessonId
  ) {
    return {
      kind: 'library-move',
      lessonId: preview.lessonId,
      disciplineId: preview.disciplineId,
      disciplineModuleId: preview.disciplineModuleId,
      overId,
    };
  }
  if (
    preview.kind === 'reorder-library-module' &&
    active.type === 'library-module' &&
    active.id === preview.moduleId
  ) {
    return {
      kind: 'reorder-library-module',
      disciplineId: preview.disciplineId,
      moduleId: preview.moduleId,
      // Unused by `commitLibraryDrop` (it reads the module's neighbours
      // straight off the previewed library) — self-referential rather than
      // invented, since a self-drop has no real "over" module to name.
      overModuleId: preview.moduleId,
    };
  }
  return null;
}
