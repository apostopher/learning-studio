import { describe, expect, it } from 'vitest';
import type {
  BoardLesson,
  BoardModule,
  LibraryLesson,
  OrgEditorBoard,
  OrgLibrary,
} from '#/lib/admin-schemas';
import {
  containerDndId,
  lessonDndId,
  libraryContainerDndId,
  libraryLessonDndId,
  libraryUntitledDndId,
} from '#/lib/dnd-ids';
import {
  boardLessonFromLibrary,
  commitTransferredLesson,
  lessonNeighbours,
  libraryLessonBox,
  libraryLessonNeighbours,
  libraryModuleNeighbours,
  linkLessonOnBoard,
  moduleNeighbours,
  moveLessonInLibrary,
  moveLessonOnBoard,
  reorderLibraryModules,
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

const mod = (
  id: number,
  lessonIds: number[],
  owner: { id: number; name: string } = { id, name: `Module ${id}` },
): BoardModule => ({
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
  owner,
  otherCourseCount: 0,
  lessons: lessonIds.map(lesson),
});

const courseBoard = (
  id: number,
  name: string,
  modules: BoardModule[],
): OrgEditorBoard[number] => ({
  course: {
    id,
    name,
    slug: `c-${id}`,
    description: null,
    imageUrlAvif: null,
    imageUrlWebp: null,
  },
  modules,
  remixes: [],
});

const makeBoard = (): OrgEditorBoard => [
  courseBoard(1, 'Two-Week Course', [mod(10, [100, 101, 102]), mod(11, [110])]),
  courseBoard(2, 'Mini Course', [mod(20, [200])]),
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
    const next = moveLessonOnBoard(board, 100, 10, 10, lessonDndId(1, 102));

    expect(idsIn(next, 10)).toEqual([101, 102, 100]);
  });

  it('appends to the target module when dropped on its container, and leaves the source behind', () => {
    // Mutant seen RED: inserted into `board` rather than the stripped copy —
    // the lesson appears in both modules and the board teaches it twice.
    const board = makeBoard();
    const next = moveLessonOnBoard(board, 101, 10, 11, containerDndId(1, 11));

    expect(idsIn(next, 11)).toEqual([110, 101]);
    expect(idsIn(next, 10)).toEqual([100, 102]);
  });

  /**
   * Final review, Critical #2. A course can show one lesson twice — its own
   * module and a borrowed one — and stripping by lesson id (the previous
   * shape) pulled BOTH copies out for the length of the drag. Only the
   * module the drag is carrying the lesson out of loses it.
   */
  it('strips the lesson from the named module only, leaving a duplicate copy elsewhere alone', () => {
    const owner = { id: 6, name: 'Source' };
    const board: OrgEditorBoard = [
      courseBoard(1, 'Remixer', [
        mod(30, [100, 101], owner),
        mod(10, [100, 102], { id: 1, name: 'Remixer' }),
        mod(11, [110], { id: 1, name: 'Remixer' }),
      ]),
    ];
    const next = moveLessonOnBoard(board, 100, 10, 11, containerDndId(1, 11));

    expect(idsIn(next, 30)).toEqual([100, 101]);
    expect(idsIn(next, 10)).toEqual([102]);
    expect(idsIn(next, 11)).toEqual([110, 100]);
  });

  it('leaves the board it was given untouched, so the rollback snapshot survives', () => {
    // Mutant seen RED: `m.lessons.splice(...)` in place of the copy — the
    // optimistic update quietly edits the snapshot the drag is holding, and
    // rolling back restores the failed move.
    const board = makeBoard();
    moveLessonOnBoard(board, 100, 10, 11, containerDndId(1, 11));

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
    expect(moduleNeighbours(makeBoard(), 1, 11)).toEqual({
      prevModuleId: 10,
      nextModuleId: null,
    });
  });
});

describe('reorderModulesOnBoard', () => {
  it('reorders inside one course and leaves the others alone', () => {
    // Mutant seen RED: `modules.push(moved)` — every reorder sends the module
    // to the bottom of its course regardless of where it was dropped.
    const next = reorderModulesOnBoard(makeBoard(), 1, 11, 10);

    expect(next[0].modules.map((m) => m.id)).toEqual([11, 10]);
    expect(next[1].modules.map((m) => m.id)).toEqual([20]);
  });

  /**
   * Course remixing puts a module (and its rank) on two rails. Reordering
   * the remixer's copy must not touch the owner's column — position is a
   * per-column concept, not a property of the module itself.
   */
  it('reorders only the named course’s copy of a module shown on two rails', () => {
    const shared = mod(10, [], { id: 6, name: 'Source' });
    const board: OrgEditorBoard = [
      courseBoard(6, 'Source', [shared, mod(11, [])]),
      courseBoard(2, 'Remixer', [mod(20, []), shared]),
    ];
    const next = reorderModulesOnBoard(board, 2, 10, 20);
    expect(next[1].modules.map((m) => m.id)).toEqual([10, 20]);
    expect(next[0].modules.map((m) => m.id)).toEqual([10, 11]); // untouched
    expect(moduleNeighbours(next, 2, 10)).toEqual({
      prevModuleId: null,
      nextModuleId: 20,
    });
    expect(moduleNeighbours(next, 6, 10)).toEqual({
      prevModuleId: null,
      nextModuleId: 11,
    });
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
      courseIds: [],
      videoProvider: null,
      disciplineModuleId: null,
      levels: [],
      requiredSubscriptions: [],
      hasDebrief: false,
      needsVideoWatch: false,
    };

    const card = boardLessonFromLibrary(draft);

    expect(card.id).toBe(500);
    expect(card.name).toBe('Wake Turbulence');
    expect(card.slug).toBe('wake-turbulence');
    expect(card.isAvailable).toBe(false);
    expect(card.isConfigured).toBe(false);
  });

  it('carries the GATES, so the chips do not flip a moment after the drop', () => {
    // The card this builds is drawn with a quickshot slot
    // (`EditorLessonCardContainer`), which the four fields below drive. They
    // used to be invented — `levels: []`, free, no debrief, no watch — on the
    // stated belief that this pane rendered no chips. It does. So a paid,
    // level-gated lesson landed showing "Free" and an empty level chip and
    // flipped once the refetch arrived, which is the exact flicker the
    // optimistic card exists to prevent.
    //
    // The fixture is deliberately NON-default on all four: defaults would
    // pass against the old hardcoded values and prove nothing.
    const gated: LibraryLesson = {
      id: 501,
      name: 'Spin recovery',
      slug: 'spin-recovery',
      isConfigured: true,
      isAvailable: true,
      courseCount: 1,
      courseIds: [],
      videoProvider: null,
      disciplineModuleId: null,
      levels: ['advanced'],
      requiredSubscriptions: ['rpoc'],
      hasDebrief: true,
      needsVideoWatch: true,
    };

    const card = boardLessonFromLibrary(gated);

    expect(card.levels).toEqual(['advanced']);
    expect(card.requiredSubscriptions).toEqual(['rpoc']);
    expect(card.hasDebrief).toBe(true);
    expect(card.needsVideoWatch).toBe(true);
  });

  it('leaves rank and the quiz count as placeholders, deliberately', () => {
    // Not every field can be carried, and saying which is the point. `rank` is
    // replaced by the refetch and never drawn; `quizQuestionCount` feeds only
    // the debrief warning's tooltip TEXT, never a chip's state, and carrying
    // it would cost the library query a per-lesson count. `dependsOn` is
    // correct rather than a placeholder — a lesson has no prerequisites in a
    // module it has just entered.
    const card = boardLessonFromLibrary({
      id: 502,
      name: 'Stalls',
      slug: 'stalls',
      isConfigured: true,
      isAvailable: true,
      courseCount: 0,
      courseIds: [],
      videoProvider: null,
      disciplineModuleId: null,
      levels: [],
      requiredSubscriptions: [],
      hasDebrief: false,
      needsVideoWatch: false,
    });

    expect(card.rank).toBe(0);
    expect(card.quizQuestionCount).toBe(0);
    expect(card.dependsOn).toEqual([]);
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
    const transferred = moveLessonOnBoard(
      board,
      100,
      10,
      11,
      containerDndId(1, 11),
    );

    expect(commitTransferredLesson(transferred, 100, 11, true)).toEqual({
      targetModuleId: 11,
      prevLessonId: 110,
      nextLessonId: null,
    });
  });

  it('rolls back instead when no transfer was applied during the drag', () => {
    // Mutant seen RED: the `transferApplied` guard dropped. Every drop on
    // nothing then persists a move — the opposite failure, and the reason the
    // flag exists rather than "commit whenever the lesson is on the board".
    expect(commitTransferredLesson(makeBoard(), 100, 10, false)).toBeNull();
  });

  it('follows the lesson to where the drag last carried it, not where it first went', () => {
    // A drag that wanders into module 11 and back into module 10 persists
    // module 10 — the holder the caller tracked through both transfers.
    const board = makeBoard();
    const viaEleven = moveLessonOnBoard(
      board,
      100,
      10,
      11,
      containerDndId(1, 11),
    );
    const backInTen = moveLessonOnBoard(
      viaEleven,
      100,
      11,
      10,
      containerDndId(1, 10),
    );

    expect(commitTransferredLesson(backInTen, 100, 10, true)).toEqual({
      targetModuleId: 10,
      prevLessonId: 102,
      nextLessonId: null,
    });
  });

  it('rolls back when the tracked holder no longer shows the lesson', () => {
    // The preview and the tracking disagree — nothing trustworthy to persist.
    expect(commitTransferredLesson(makeBoard(), 100, 11, true)).toBeNull();
  });
});

/**
 * Task 6's library-side fixture, mirroring `resolve-drop.test.ts`'s: two
 * disciplines. Weather (4) has modules Basics (7, lessons L1/L2) and
 * Advanced (8, lesson L6), plus its own Untitled group (L3). Navigation (9)
 * has one module, 20, holding L30.
 */
const libLesson = (
  id: number,
  disciplineModuleId: number | null,
): LibraryLesson => ({
  id,
  name: `L${id}`,
  slug: `ll-${id}`,
  isConfigured: true,
  isAvailable: true,
  courseCount: 0,
  courseIds: [],
  videoProvider: null,
  disciplineModuleId,
  levels: [],
  requiredSubscriptions: [],
  hasDebrief: false,
  needsVideoWatch: false,
});

const WEATHER = 4;
const NAVIGATION = 9;
const BASICS_MODULE = 7;
const ADVANCED_MODULE = 8;
const NAV_MODULE = 20;

const makeLibrary = (): OrgLibrary => ({
  disciplines: [
    {
      id: WEATHER,
      name: 'Weather',
      slug: 'weather',
      modules: [
        {
          id: BASICS_MODULE,
          name: 'Basics',
          rank: 0,
          lessons: [libLesson(1, BASICS_MODULE), libLesson(2, BASICS_MODULE)],
        },
        {
          id: ADVANCED_MODULE,
          name: 'Advanced',
          rank: 1,
          lessons: [libLesson(6, ADVANCED_MODULE)],
        },
      ],
      untitled: [libLesson(3, null)],
    },
    {
      id: NAVIGATION,
      name: 'Navigation',
      slug: 'navigation',
      modules: [
        {
          id: NAV_MODULE,
          name: 'Charts',
          rank: 0,
          lessons: [libLesson(30, NAV_MODULE)],
        },
      ],
      untitled: [],
    },
  ],
  untitled: [],
});

const idsInModule = (library: OrgLibrary, moduleId: number) =>
  library.disciplines
    .flatMap((d) => d.modules)
    .find((m) => m.id === moduleId)
    ?.lessons.map((l) => l.id);

const idsInUntitled = (library: OrgLibrary, disciplineId: number) =>
  library.disciplines
    .find((d) => d.id === disciplineId)
    ?.untitled.map((l) => l.id);

describe('moveLessonInLibrary', () => {
  it('moves lesson 3 from Untitled into module 8 before lesson 6, updating disciplineModuleId', () => {
    const library = makeLibrary();
    const next = moveLessonInLibrary(
      library,
      3,
      ADVANCED_MODULE,
      libraryLessonDndId(6),
    );

    expect(idsInModule(next, ADVANCED_MODULE)).toEqual([3, 6]);
    expect(idsInUntitled(next, WEATHER)).toEqual([]);
    const moved = next.disciplines
      .flatMap((d) => d.modules)
      .flatMap((m) => m.lessons)
      .find((l) => l.id === 3);
    expect(moved?.disciplineModuleId).toBe(ADVANCED_MODULE);
  });

  it('appends to the target module when dropped on its container', () => {
    const library = makeLibrary();
    const next = moveLessonInLibrary(
      library,
      3,
      ADVANCED_MODULE,
      libraryContainerDndId(ADVANCED_MODULE),
    );

    expect(idsInModule(next, ADVANCED_MODULE)).toEqual([6, 3]);
  });

  it('files a lesson OUT of a module into its discipline’s Untitled group, over the untitled droppable', () => {
    const library = makeLibrary();
    const next = moveLessonInLibrary(
      library,
      1,
      null,
      libraryUntitledDndId(WEATHER),
    );

    expect(idsInModule(next, BASICS_MODULE)).toEqual([2]);
    expect(idsInUntitled(next, WEATHER)).toEqual([3, 1]);
    const moved = next.disciplines
      .find((d) => d.id === WEATHER)
      ?.untitled.find((l) => l.id === 1);
    expect(moved?.disciplineModuleId).toBeNull();
  });

  it('reorders within the SAME module, landing in the slot under the pointer', () => {
    // Mirrors moveLessonOnBoard's own "moving down its own module" case: the
    // insertion index is read BEFORE the dragged lesson is pulled out.
    const library = makeLibrary();
    const next = moveLessonInLibrary(
      library,
      1,
      BASICS_MODULE,
      libraryLessonDndId(2),
    );

    expect(idsInModule(next, BASICS_MODULE)).toEqual([2, 1]);
  });

  it('leaves the OTHER discipline referentially identical', () => {
    const library = makeLibrary();
    const navigation = library.disciplines.find((d) => d.id === NAVIGATION);
    const next = moveLessonInLibrary(
      library,
      3,
      ADVANCED_MODULE,
      libraryLessonDndId(6),
    );

    expect(next.disciplines.find((d) => d.id === NAVIGATION)).toBe(navigation);
  });

  it('leaves the library it was given untouched', () => {
    const library = makeLibrary();
    moveLessonInLibrary(library, 3, ADVANCED_MODULE, libraryLessonDndId(6));

    expect(idsInUntitled(library, WEATHER)).toEqual([3]);
    expect(idsInModule(library, ADVANCED_MODULE)).toEqual([6]);
  });
});

describe('reorderLibraryModules', () => {
  it('swaps modules within discipline 4 only, leaving discipline 9 alone', () => {
    const library = makeLibrary();
    const navigation = library.disciplines.find((d) => d.id === NAVIGATION);
    const next = reorderLibraryModules(
      library,
      WEATHER,
      ADVANCED_MODULE,
      BASICS_MODULE,
    );

    expect(
      next.disciplines.find((d) => d.id === WEATHER)?.modules.map((m) => m.id),
    ).toEqual([ADVANCED_MODULE, BASICS_MODULE]);
    expect(next.disciplines.find((d) => d.id === NAVIGATION)).toBe(navigation);
  });

  it('returns the input unchanged when moduleId and overModuleId are in DIFFERENT disciplines', () => {
    // Coverage gap: BASICS_MODULE (7) is Weather's own module, but
    // NAV_MODULE (20) belongs to Navigation — `disciplineId` names Weather,
    // so NAV_MODULE is not found there and there is nothing to reorder.
    const library = makeLibrary();
    const next = reorderLibraryModules(
      library,
      WEATHER,
      BASICS_MODULE,
      NAV_MODULE,
    );

    expect(next).toBe(library);
  });

  it('leaves the library it was given untouched', () => {
    const library = makeLibrary();
    reorderLibraryModules(library, WEATHER, ADVANCED_MODULE, BASICS_MODULE);

    expect(
      library.disciplines
        .find((d) => d.id === WEATHER)
        ?.modules.map((m) => m.id),
    ).toEqual([BASICS_MODULE, ADVANCED_MODULE]);
  });
});

describe('the rank anchors sent to the API — library side', () => {
  it("reads a library lesson's neighbours within its bucket", () => {
    const library = makeLibrary();
    expect(libraryLessonNeighbours(library, 2)).toEqual({
      prevLessonId: 1,
      nextLessonId: null,
    });
    expect(libraryLessonNeighbours(library, 1)).toEqual({
      prevLessonId: null,
      nextLessonId: 2,
    });
  });

  /**
   * Mutant this catches: `at = -1` for a lesson no bucket holds, so
   * `bucket[at + 1]` — `bucket[0]` — was handed to the server as the "next"
   * neighbour of a lesson that isn't there. Both anchors are null instead.
   */
  it('answers null neighbours for a lesson no bucket holds, never bucket[0]', () => {
    const library = makeLibrary();
    expect(libraryLessonNeighbours(library, 999)).toEqual({
      prevLessonId: null,
      nextLessonId: null,
    });
    // Nor the org-level Untitled's first lesson, when that is the fallback.
    const withOrphan: OrgLibrary = {
      ...library,
      untitled: [libLesson(50, null)],
    };
    expect(libraryLessonNeighbours(withOrphan, 999)).toEqual({
      prevLessonId: null,
      nextLessonId: null,
    });
  });

  it("reads a discipline module's neighbours within its own discipline, never across disciplines", () => {
    const library = makeLibrary();
    expect(libraryModuleNeighbours(library, WEATHER, ADVANCED_MODULE)).toEqual({
      prevModuleId: BASICS_MODULE,
      nextModuleId: null,
    });
    expect(libraryModuleNeighbours(library, WEATHER, BASICS_MODULE)).toEqual({
      prevModuleId: null,
      nextModuleId: ADVANCED_MODULE,
    });
  });
});

/**
 * The box a library lesson is CURRENTLY shown in, by walking the buckets —
 * what `onDragOver` compares the target box against to tell a same-box
 * hover (the sortable animates it; no live write, or the card and its
 * displaced sibling swap on every pointer move) from a cross-box one (the
 * live write carries the card over).
 */
describe('libraryLessonBox', () => {
  it('names the module and discipline a filed lesson sits in', () => {
    expect(libraryLessonBox(makeLibrary(), 6)).toEqual({
      disciplineId: WEATHER,
      boxId: ADVANCED_MODULE,
    });
  });

  it("names a discipline's own Untitled group as boxId null", () => {
    expect(libraryLessonBox(makeLibrary(), 3)).toEqual({
      disciplineId: WEATHER,
      boxId: null,
    });
  });

  it('reads the bucket, not the card’s own disciplineModuleId', () => {
    // A stale card claims module 8 but is filed under Untitled.
    const library = makeLibrary();
    const stale: OrgLibrary = {
      ...library,
      disciplines: library.disciplines.map((d) =>
        d.id === WEATHER
          ? { ...d, untitled: [libLesson(3, ADVANCED_MODULE)] }
          : d,
      ),
    };
    expect(libraryLessonBox(stale, 3)).toEqual({
      disciplineId: WEATHER,
      boxId: null,
    });
  });

  it('answers disciplineId null for the org-level Untitled column, and null for a lesson nowhere', () => {
    const library: OrgLibrary = {
      ...makeLibrary(),
      untitled: [libLesson(50, null)],
    };
    expect(libraryLessonBox(library, 50)).toEqual({
      disciplineId: null,
      boxId: null,
    });
    expect(libraryLessonBox(library, 999)).toBeNull();
  });
});
