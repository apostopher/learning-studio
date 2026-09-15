// `#/` not `@/`: this module is pure and sits beside `resolve-drop.ts`, which
// its test imports directly; keeping the alias consistent avoids a resolution
// trap the moment a test reaches for either.
import type { OrgLibrary } from '#/lib/admin-schemas';
import {
  libraryLessonNeighbours,
  libraryModuleNeighbours,
} from './editor-board-updates';
import type { DropResolution } from './resolve-drop';

export type LibraryCommit =
  | {
      kind: 'place';
      vars: {
        lessonId: number;
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
  resolution: Extract<
    DropResolution,
    { kind: 'library-move' | 'reorder-library-module' }
  >,
  previewed: OrgLibrary,
): LibraryCommit {
  if (resolution.kind === 'library-move') {
    return {
      kind: 'place',
      vars: {
        lessonId: resolution.lessonId,
        disciplineModuleId: resolution.disciplineModuleId,
        ...libraryLessonNeighbours(previewed, resolution.lessonId),
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
