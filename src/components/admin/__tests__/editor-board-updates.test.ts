import { describe, expect, it } from 'vitest';
import type {
  BoardLesson,
  BoardModule,
  LibraryLesson,
  OrgEditorBoard,
} from '#/lib/admin-schemas';
import { containerDndId, lessonDndId } from '#/lib/dnd-ids';
import {
  boardLessonFromLibrary,
  commitTransferredLesson,
  lessonNeighbours,
  linkLessonOnBoard,
  moduleNeighbours,
  moveLessonOnBoard,
  reorderModulesOnBoard,
} from '../editor-board-updates';

const lesson = (id: number): BoardLesson => ({
  id,
  name: `Lesson ${id}`,
  slug: `l-${id}`,
  rank: id,
  isAvailable: true,
  hasDebrief: false,
  needsVideoWatch: false,
  requiredSubscriptions: [],
  levels: [],
  isConfigured: true,
  quizQuestionCount: 0,
  dependsOn: [],
  videoProvider: null,
  videoRef: null,
});

const mod = (id: number, lessonIds: number[]): BoardModule => ({
  id,
  name: `Module ${id}`,
  slug: `m-${id}`,
  imageUrlAvif: null,
  imageUrlWebp: null,
  rank: id,
  requiredSubscriptions: [],
  dependsOn: [],
  sequentialLessons: false,
  learnerCount: 0,
  lessons: lessonIds.map(lesson),
});

const makeBoard = (): OrgEditorBoard => [
  {
    course: {
      id: 1,
      name: 'Two-Week Course',
      slug: 'c-1',
      description: null,
      imageUrlAvif: null,
      imageUrlWebp: null,
    },
    modules: [mod(10, [100, 101, 102]), mod(11, [110])],
  },
  {
    course: {
      id: 2,
      name: 'Mini Course',
      slug: 'c-2',
      description: null,
      imageUrlAvif: null,
      imageUrlWebp: null,
    },
    modules: [mod(20, [200])],
  },
];

const idsIn = (board: OrgEditorBoard, moduleId: number) =>
  board
    .flatMap((cb) => cb.modules)
    .find((m) => m.id === moduleId)
    ?.lessons.map((l) => l.id);

describe('moveLessonOnBoard', () => {
  it('drops a lesson into the slot it was dragged onto, moving down its own module', () => {
    // Mutant seen RED: the over index read AFTER the lesson is pulled out
    // (`overIndexIn(stripped…)`), the classic off-by-one — 100 lands between
    // 101 and 102 instead of after 102.
    const board = makeBoard();
    const next = moveLessonOnBoard(board, 100, 10, lessonDndId(102));

    expect(idsIn(next, 10)).toEqual([101, 102, 100]);
  });

  it('appends to the target module when dropped on its container, and leaves the source behind', () => {
    // Mutant seen RED: inserted into `board` rather than the stripped copy —
    // the lesson appears in both modules and the board teaches it twice.
    const board = makeBoard();
    const next = moveLessonOnBoard(board, 101, 11, containerDndId(11));

    expect(idsIn(next, 11)).toEqual([110, 101]);
    expect(idsIn(next, 10)).toEqual([100, 102]);
  });

  it('leaves the board it was given untouched, so the rollback snapshot survives', () => {
    // Mutant seen RED: `m.lessons.splice(...)` in place of the copy — the
    // optimistic update quietly edits the snapshot the drag is holding, and
    // rolling back restores the failed move.
    const board = makeBoard();
    moveLessonOnBoard(board, 100, 11, containerDndId(11));

    expect(idsIn(board, 10)).toEqual([100, 101, 102]);
    expect(idsIn(board, 11)).toEqual([110]);
  });
});

describe('linkLessonOnBoard', () => {
  it('appends the new placement, matching where the server puts it', () => {
    // Mutant seen RED: inserted at index 0. The link route takes no
    // neighbours and always appends, so a card shown anywhere else jumps the
    // moment the refetch lands.
    const board = makeBoard();
    const next = linkLessonOnBoard(board, lesson(500), 10);

    expect(idsIn(next, 10)).toEqual([100, 101, 102, 500]);
  });
});

describe('the rank anchors sent to the API', () => {
  it("reads a lesson's neighbours in its module", () => {
    // Mutant seen RED: prev and next swapped — the move persists in reverse
    // and the board snaps back to a different order on refetch.
    expect(lessonNeighbours(makeBoard(), 10, 101)).toEqual({
      prevLessonId: 100,
      nextLessonId: 102,
    });
    expect(lessonNeighbours(makeBoard(), 10, 100)).toEqual({
      prevLessonId: null,
      nextLessonId: 101,
    });
  });

  it("reads a module's neighbours within its own course, never across courses", () => {
    // Mutant seen RED: the search flattened across every course, so module 11
    // (last in course 1) reports module 20 of the Mini Course as its next.
    expect(moduleNeighbours(makeBoard(), 11)).toEqual({
      prevModuleId: 10,
      nextModuleId: null,
    });
  });
});

describe('reorderModulesOnBoard', () => {
  it('reorders inside one course and leaves the others alone', () => {
    // Mutant seen RED: `modules.push(moved)` — every reorder sends the module
    // to the bottom of its course regardless of where it was dropped.
    const next = reorderModulesOnBoard(makeBoard(), 11, 10);

    expect(next[0].modules.map((m) => m.id)).toEqual([11, 10]);
    expect(next[1].modules.map((m) => m.id)).toEqual([20]);
  });
});

describe('boardLessonFromLibrary', () => {
  it('carries through every field the card actually draws', () => {
    // Mutant seen RED: `isAvailable: true` hardcoded. The optimistic card
    // then drops the "Draft" badge that the real one shows a moment later.
    const draft: LibraryLesson = {
      id: 500,
      name: 'Wake Turbulence',
      slug: 'wake-turbulence',
      isConfigured: false,
      isAvailable: false,
      courseCount: 0,
    };

    const card = boardLessonFromLibrary(draft);

    expect(card.id).toBe(500);
    expect(card.name).toBe('Wake Turbulence');
    expect(card.slug).toBe('wake-turbulence');
    expect(card.isAvailable).toBe(false);
    expect(card.isConfigured).toBe(false);
  });
});

describe('commitTransferredLesson', () => {
  it('commits the transfer when the drop landed on the dragged lesson itself', () => {
    // Round-1 review (Critical 1). `onDragOver` transfers the lesson into the
    // target module live; the transferred card is then a droppable of its own,
    // so the release can land on `active.id` — a self-drop, which resolveDrop
    // correctly answers `null` for. The old path rolled back there, so a
    // cross-module move the admin watched happen silently undid itself.
    //
    // Mutant seen RED: `return null;` as the first statement — exactly the
    // rollback-always behaviour this replaces. Right return type, right
    // shape, and the bug is invisible to any test that only checks the
    // rollback branch.
    const board = makeBoard();
    const transferred = moveLessonOnBoard(board, 100, 11, containerDndId(11));

    expect(commitTransferredLesson(transferred, 100, true)).toEqual({
      targetModuleId: 11,
      prevLessonId: 110,
      nextLessonId: null,
    });
  });

  it('rolls back instead when no transfer was applied during the drag', () => {
    // Mutant seen RED: the `transferApplied` guard dropped. Every drop on
    // nothing then persists a move — the opposite failure, and the reason the
    // flag exists rather than "commit whenever the lesson is on the board".
    expect(commitTransferredLesson(makeBoard(), 100, false)).toBeNull();
  });

  it('follows the lesson to where it actually ended up, not where it first went', () => {
    // Mutant seen RED: the target module remembered from the transfer instead
    // of read from the board — a drag that wanders into module 11 and back
    // into module 10 would persist the wrong module.
    const board = makeBoard();
    const viaEleven = moveLessonOnBoard(board, 100, 11, containerDndId(11));
    const backInTen = moveLessonOnBoard(viaEleven, 100, 10, containerDndId(10));

    expect(commitTransferredLesson(backInTen, 100, true)).toEqual({
      targetModuleId: 10,
      prevLessonId: 102,
      nextLessonId: null,
    });
  });
});
