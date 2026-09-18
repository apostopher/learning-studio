import { describe, expect, it } from 'vitest';
import type {
  BoardLesson,
  BoardModule,
  CourseBoard,
  LibraryDisciplineModule,
  LibraryLesson,
  OrgEditorBoard,
  OrgLibrary,
} from '#/lib/admin-schemas';
import {
  containerDndId,
  courseDndId,
  disciplineDndId,
  lessonDndId,
  libraryContainerDndId,
  libraryLessonDndId,
  libraryModuleDndId,
  libraryUntitledDndId,
  moduleDndId,
  UNTITLED_DISCIPLINE_ID,
} from '#/lib/dnd-ids';
import { removeLessonLabel } from '../lesson-card-labels';
import { resolveDrop } from '../resolve-drop';

const lesson = (id: number, name: string): BoardLesson => ({
  id,
  name,
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
  name: string,
  lessons: BoardLesson[],
  owner: { id: number; name: string } = { id, name },
): BoardModule => ({
  id,
  name,
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
  lessons,
});

const courseBoard = (
  id: number,
  name: string,
  modules: BoardModule[],
): CourseBoard => ({
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

/**
 * Two courses, so every cross-course refusal has a real second course to be
 * refused into rather than a hypothetical one.
 *
 * Lesson 200 ("Radio Calls") is deliberately BOTH a library lesson and
 * already placed in the Mini Course — that overlap is the whole of the
 * "already teaches this" rule.
 */
const STALLS = 100;
const GO_AROUND = 101;
// Fundamentals holds TWO lessons on purpose: with one lesson per module a
// same-module reorder cannot be expressed at all, and the whitelist row for it
// would go untested while looking tested.
const TAXIING = 102;
const RADIO_CALLS = 200;
const WAKE_TURBULENCE = 500;

const FUNDAMENTALS = 10;
const CIRCUITS = 11;
const BASICS = 20;

// Every module below is owned by the course whose column it sits in — none
// of these fixtures are borrowed, so the `mod(...)` default owner (matching
// the MODULE's own id/name, not a course) would wrongly mark all of them as
// borrowed. The borrowed case is covered separately, below.
const TWO_WEEK_COURSE = { id: 1, name: 'Two-Week Course' };
const MINI_COURSE = { id: 2, name: 'Mini Course' };

const board: OrgEditorBoard = [
  courseBoard(1, 'Two-Week Course', [
    mod(
      FUNDAMENTALS,
      'Fundamentals',
      [lesson(STALLS, 'Stalls'), lesson(TAXIING, 'Taxiing')],
      TWO_WEEK_COURSE,
    ),
    mod(
      CIRCUITS,
      'Circuits',
      [lesson(GO_AROUND, 'Go-around')],
      TWO_WEEK_COURSE,
    ),
  ]),
  courseBoard(2, 'Mini Course', [
    mod(BASICS, 'Basics', [lesson(RADIO_CALLS, 'Radio Calls')], MINI_COURSE),
  ]),
  // A course with NO modules — the only state in which the `course` drop
  // target is rendered.
  courseBoard(3, 'Weekend Refresher', []),
];

/**
 * Where a lesson drag was picked up — `resolveDrop`'s fourth argument, read
 * by the editor from the sortable's `data.moduleId` at drag START. Every
 * lesson drag below passes one; a drag without it is unresolvable (`null`),
 * pinned in its own test.
 */
const from = (moduleId: number) => ({ moduleId });

/**
 * Task 6's library-side fixture: two disciplines. Weather (4) has modules
 * Basics (7, lessons L1/L2) and Advanced (8, lesson L6), plus its own
 * Untitled group (L3). Navigation (9) has one module, 20, holding L30 — the
 * SAME numeric id as `BASICS` above (a course-side module in an unrelated
 * course board): the two live in different id spaces (`library-module-20`
 * vs `module-2-20`), so the collision is deliberate, not a bug.
 *
 * The org-level `untitled` column (lessons with NO discipline at all) holds
 * one lesson, ORPHAN (50) — Ruling 2's case, distinct from a discipline's
 * OWN Untitled group.
 */
const libraryLesson = (
  id: number,
  name: string,
  disciplineModuleId: number | null,
): LibraryLesson => ({
  id,
  name,
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

const libraryModule = (
  id: number,
  name: string,
  lessons: LibraryDisciplineModule['lessons'],
): LibraryDisciplineModule => ({ id, name, rank: id, lessons });

const L1 = 1;
const L2 = 2;
const L3 = 3;
const L6 = 6;
const L30 = 30;
const ORPHAN = 50;
const WEATHER = 4;
const BASICS_MODULE = 7;
const ADVANCED_MODULE = 8;
const NAVIGATION = 9;
const NAV_MODULE = 20;

function libraryFixture(): OrgLibrary {
  return {
    disciplines: [
      {
        id: WEATHER,
        name: 'Weather',
        slug: 'weather',
        modules: [
          libraryModule(BASICS_MODULE, 'Basics', [
            libraryLesson(L1, 'L1', BASICS_MODULE),
            libraryLesson(L2, 'L2', BASICS_MODULE),
          ]),
          libraryModule(ADVANCED_MODULE, 'Advanced', [
            libraryLesson(L6, 'L6', ADVANCED_MODULE),
          ]),
        ],
        untitled: [libraryLesson(L3, 'L3', null)],
      },
      {
        id: NAVIGATION,
        name: 'Navigation',
        slug: 'navigation',
        modules: [
          libraryModule(NAV_MODULE, 'Charts', [
            libraryLesson(L30, 'L30', NAV_MODULE),
          ]),
        ],
        untitled: [],
      },
    ],
    untitled: [libraryLesson(ORPHAN, 'Orphan', null)],
  };
}

describe('resolveDrop — the allowed drops', () => {
  it('links a library lesson into the module it was dropped on', () => {
    // Mutant seen RED: `moduleId: to.courseBoard.modules[0].id` — links into
    // the course's FIRST module instead of the hovered one. Right shape,
    // right course, wrong module; only asserting the exact module catches it.
    expect(
      resolveDrop(
        board,
        libraryLessonDndId(WAKE_TURBULENCE),
        containerDndId(1, CIRCUITS),
      ),
    ).toEqual({
      kind: 'link',
      moduleId: CIRCUITS,
      lessonId: WAKE_TURBULENCE,
    });
  });

  it('moves a placed lesson into another module of the same course', () => {
    // Mutant seen RED: `moduleId: from.module.id` — a "move" that reports the
    // module the lesson is already in, so the lesson never leaves it.
    expect(
      resolveDrop(
        board,
        lessonDndId(1, STALLS),
        containerDndId(1, CIRCUITS),
        from(FUNDAMENTALS),
      ),
    ).toEqual({
      kind: 'move',
      moduleId: CIRCUITS,
      lessonId: STALLS,
      fromModuleId: FUNDAMENTALS,
      overId: containerDndId(1, CIRCUITS),
    });
  });

  it('moves a placed lesson onto a named slot in a sibling module', () => {
    // Round-1 review (Important 1): this test used to claim it covered a
    // same-module reorder, but STALLS is in Fundamentals and GO_AROUND is in
    // Circuits — its own `moduleId: CIRCUITS` assertion proved it was a
    // cross-module drop. The same-module row is now covered below.
    expect(
      resolveDrop(
        board,
        lessonDndId(1, STALLS),
        lessonDndId(1, GO_AROUND),
        from(FUNDAMENTALS),
      ),
    ).toEqual({
      kind: 'move',
      moduleId: CIRCUITS,
      lessonId: STALLS,
      fromModuleId: FUNDAMENTALS,
      overId: lessonDndId(1, GO_AROUND),
    });
  });

  it('reorders a placed lesson onto a slot in its OWN module', () => {
    // Whitelist row 3. Mutant seen RED:
    // `if (to.module.id === from.module.id) return null;` — a same-module drop
    // treated as a no-op, so a reorder within a module silently does nothing
    // while every cross-module move keeps working.
    //
    // A same-module drop is a `move` too, not a fifth kind: the over id names
    // the slot, which is why `overId` is carried through rather than dropped.
    expect(
      resolveDrop(
        board,
        lessonDndId(1, STALLS),
        lessonDndId(1, TAXIING),
        from(FUNDAMENTALS),
      ),
    ).toEqual({
      kind: 'move',
      moduleId: FUNDAMENTALS,
      lessonId: STALLS,
      fromModuleId: FUNDAMENTALS,
      overId: lessonDndId(1, TAXIING),
    });
  });

  it('reorders a module against another module of the same course', () => {
    // Mutant seen RED: the two ids swapped —
    // `{ moduleId: to.module.id, overModuleId: from.module.id }`. Both fields
    // are present and plausible, and the reorder runs backwards.
    expect(
      resolveDrop(
        board,
        moduleDndId(1, FUNDAMENTALS),
        moduleDndId(1, CIRCUITS),
      ),
    ).toEqual({
      kind: 'reorder-module',
      courseId: 1,
      moduleId: FUNDAMENTALS,
      overModuleId: CIRCUITS,
    });
  });
});

describe('resolveDrop — the refusals, each stating its reason', () => {
  it('refuses a placed lesson dropped into a different course, naming both courses', () => {
    // Mutant seen RED: `reason: 'That drop is not allowed.'` — refuses the
    // right drop and tells the admin nothing. Asserting only
    // `kind === 'forbidden'` would pass it, and would also pass an
    // implementation that refuses every drop on the board.
    const result = resolveDrop(
      board,
      lessonDndId(1, STALLS),
      containerDndId(2, BASICS),
      from(FUNDAMENTALS),
    );

    expect(result?.kind).toBe('forbidden');
    const reason = result?.kind === 'forbidden' ? result.reason : '';
    expect(reason).toContain('Two-Week Course');
    expect(reason).toContain('Mini Course');
    // It must say what to do instead, not only that the door is shut.
    expect(reason).toContain('library');
  });

  it('refuses a library lesson dropped on a discipline column, with a reason', () => {
    // Mutant seen RED: `return null` for the discipline branch — the drag
    // springs back in silence, which is exactly the failure this rule exists
    // to prevent.
    const result = resolveDrop(
      board,
      libraryLessonDndId(WAKE_TURBULENCE),
      disciplineDndId(7),
    );

    expect(result?.kind).toBe('forbidden');
    const reason = result?.kind === 'forbidden' ? result.reason : '';
    expect(reason).toContain('discipline');
    expect(reason).toContain('module');
  });

  it('refuses a module dragged into another course, naming both courses', () => {
    // Round-1 review (Important 2): reachable — module drags keep every
    // course's modules in the candidate set so this refusal can be stated at
    // all — and previously untested. Mutant seen RED: the same-course guard
    // removed, so the branch falls through to `reorder-module` and a module
    // is dragged out of its own course into another one.
    const result = resolveDrop(
      board,
      moduleDndId(1, FUNDAMENTALS),
      moduleDndId(2, BASICS),
    );

    expect(result?.kind).toBe('forbidden');
    const reason = result?.kind === 'forbidden' ? result.reason : '';
    expect(reason).toContain('Fundamentals');
    expect(reason).toContain('Two-Week Course');
    expect(reason).toContain('Mini Course');
  });

  it('refuses a placed lesson dragged back to the library, and says what to do instead', () => {
    // Round-1 review (Important 2): dragging a lesson out of a course and
    // back to the library is a natural gesture, so it must answer with a
    // sentence rather than a shrug. Mutant seen RED: `return null` for that
    // branch — the drag springs back in silence.
    const result = resolveDrop(
      board,
      lessonDndId(1, STALLS),
      disciplineDndId(7),
      from(FUNDAMENTALS),
    );

    expect(result?.kind).toBe('forbidden');
    const reason = result?.kind === 'forbidden' ? result.reason : '';
    expect(reason).toContain('Stalls');
    expect(reason).toContain('Fundamentals');
    expect(reason).toContain('Remove');
  });

  /**
   * The sentence above tells the reader to go and use a control, so it has to
   * name that control by the label the control actually wears. Both sides
   * build it from `removeLessonLabel`, and this asserts they agree —
   * hand-writing the phrase in either place is the drift this catches.
   *
   * Mutant seen RED: the refusal inlines `Use "Remove from module" on its
   * card` (this task's own first draft) — plausible, readable, and naming a
   * label no button in the editor carries, so the reader hunts for a control
   * that is not there.
   */
  it('names the remove control by the exact label the card renders', () => {
    const result = resolveDrop(
      board,
      lessonDndId(1, STALLS),
      disciplineDndId(7),
      from(FUNDAMENTALS),
    );

    const reason = result?.kind === 'forbidden' ? result.reason : '';
    expect(reason).toContain(
      `"${removeLessonLabel('Stalls', 'Fundamentals')}"`,
    );
  });

  it('refuses a library lesson a course already teaches, saying it is already there', () => {
    // Mutant seen RED: the `courseTeaches` guard dropped, so the drop
    // resolves to a `link` and the admin only learns it was impossible when
    // the server answers 409.
    const result = resolveDrop(
      board,
      libraryLessonDndId(RADIO_CALLS),
      containerDndId(2, BASICS),
    );

    expect(result?.kind).toBe('forbidden');
    const reason = result?.kind === 'forbidden' ? result.reason : '';
    expect(reason).toContain('Mini Course');
    expect(reason).toContain('already teaches');
  });
});

describe('resolveDrop — no target at all', () => {
  it('answers null, not forbidden, for an unrecognised or absent target', () => {
    // Mutant seen RED: `return { kind: 'forbidden', reason: 'You cannot drop
    // that there.' }` in place of each `return null` — a refuse-everything
    // implementation. This is the test that stops "forbidden" from being the
    // answer to every question.

    // Not an id this editor mints at all.
    expect(
      resolveDrop(board, libraryLessonDndId(WAKE_TURBULENCE), 'trash-can'),
    ).toBeNull();
    // A well-formed id for a module that is not on the board.
    expect(
      resolveDrop(
        board,
        libraryLessonDndId(WAKE_TURBULENCE),
        containerDndId(1, 999),
      ),
    ).toBeNull();
    // Dropped on nothing, expressed as the empty over id dnd-kit reports.
    expect(
      resolveDrop(board, lessonDndId(1, STALLS), '', from(FUNDAMENTALS)),
    ).toBeNull();
    // A lesson drag whose pick-up module the caller failed to capture is
    // unresolvable, not a guess: the only other way to find `from` is a
    // search by lesson id, which lands on the wrong copy of a duplicated
    // lesson (see "duplicate lessons" below).
    expect(
      resolveDrop(board, lessonDndId(1, STALLS), containerDndId(1, CIRCUITS)),
    ).toBeNull();
    // Dropped back on itself.
    expect(
      resolveDrop(
        board,
        moduleDndId(1, FUNDAMENTALS),
        moduleDndId(1, FUNDAMENTALS),
      ),
    ).toBeNull();
  });
});

/**
 * The COURSE column itself is a drop target only while the course has no
 * modules (`EditorCourseEmptyContainer`). It exists so that dragging a lesson
 * onto an empty course is refused BY NAME instead of springing back in
 * silence, which reads as a bug rather than a rule.
 *
 * Every case below is `forbidden`, never `link`: a lesson lives inside a
 * module, and `resolveDrop` does not invent one.
 */
describe('resolveDrop — dropping on a course column itself', () => {
  it('refuses a library lesson on an empty course, naming the remedy', () => {
    const result = resolveDrop(
      board,
      libraryLessonDndId(WAKE_TURBULENCE),
      courseDndId(3),
    );

    // Mutant this catches: returning `link` with a synthesised module id, or
    // with the course id used as one — either would place the lesson
    // somewhere that does not exist.
    expect(result?.kind).toBe('forbidden');
    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        'Weekend Refresher has no modules yet, and a lesson can only sit inside a module. Create one first, then drop the lesson into it.',
    });
  });

  it('points at the existing modules when the course has some', () => {
    // The target is not rendered in this state, but the function does not
    // assume that — and a reason telling someone to create a module when
    // three are on screen would be worse than useless.
    const result = resolveDrop(
      board,
      libraryLessonDndId(WAKE_TURBULENCE),
      courseDndId(1),
    );

    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        "Drop the lesson on one of Two-Week Course's modules — a lesson sits inside a module, not loose in the course.",
    });
  });

  it('refuses a PLACED lesson from another course with the cross-course reason', () => {
    // Mutant this catches: reusing the create-a-module sentence here. The
    // module is not what is missing — this lesson may not cross courses at
    // all, and telling the reader to create a module would send them to do
    // something that still would not work.
    const result = resolveDrop(
      board,
      lessonDndId(1, STALLS),
      courseDndId(3),
      from(FUNDAMENTALS),
    );

    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        '"Stalls" is placed in Two-Week Course, and a placed lesson only moves between modules of its own course. Drag it from the library to add it to Weekend Refresher as well.',
    });
  });

  it('refuses a placed lesson dropped on its OWN course with the module reason', () => {
    const result = resolveDrop(
      board,
      lessonDndId(1, STALLS),
      courseDndId(1),
      from(FUNDAMENTALS),
    );

    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        "Drop the lesson on one of Two-Week Course's modules — a lesson sits inside a module, not loose in the course.",
    });
  });

  it('refuses a module dropped on another course', () => {
    const result = resolveDrop(
      board,
      moduleDndId(1, FUNDAMENTALS),
      courseDndId(3),
    );

    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        '"Fundamentals" is placed in Two-Week Course, and modules are only reordered within their own course — they cannot be moved into Weekend Refresher.',
    });
  });

  it('answers null for a course that is not on the board', () => {
    // Mutant this catches: reading `.course.name` off the lookup without
    // checking it, which throws instead of declining — a board that changed
    // under an in-flight drag would take the whole editor down.
    expect(
      resolveDrop(board, libraryLessonDndId(WAKE_TURBULENCE), courseDndId(99)),
    ).toBeNull();
  });
});

/**
 * Course remixing puts the same module — and every lesson placed in it — on
 * TWO rails at once. `findModule`/`findPlacedLesson` used to answer "the
 * first column holding this id", which for a remixed module is always the
 * owner's column, never the remixer's.
 */
describe('resolveDrop — the same module shown on two rails', () => {
  /**
   * The same module on two rails. A drag that starts on course 2's copy and
   * lands on course 2's other module is a reorder IN COURSE 2 — the mutant
   * is `findModule` returning the first column that holds module 10 (course
   * 6, the owner), which then refuses the drop as cross-course.
   */
  it('resolves a reorder within the column the drag started in, even when the module is also on another rail', () => {
    const shared = mod(10, 'Shared', [], { id: 6, name: 'Source' });
    const remixedBoard: OrgEditorBoard = [
      courseBoard(6, 'Source', [shared]),
      courseBoard(2, 'Remixer', [mod(20, 'Own', []), shared]),
    ];
    expect(
      resolveDrop(remixedBoard, moduleDndId(2, 10), moduleDndId(2, 20)),
    ).toEqual({
      kind: 'reorder-module',
      courseId: 2,
      moduleId: 10,
      overModuleId: 20,
    });
  });

  /**
   * The same module rendered in two columns is two DIFFERENT cards, even
   * though `to.module.id === from.module.id` is true for both. Mutant this
   * catches: comparing module ids alone (the pre-remix check) treats a drag
   * from the remixer's card onto the owner's card of the SAME module as a
   * self-drop no-op, instead of the cross-course refusal it actually is.
   */
  it('refuses a module dragged onto the OTHER column rendering the same module', () => {
    const shared = mod(10, 'Shared', [], { id: 6, name: 'Source' });
    const remixedBoard: OrgEditorBoard = [
      courseBoard(6, 'Source', [shared]),
      courseBoard(2, 'Remixer', [mod(20, 'Own', []), shared]),
    ];
    const result = resolveDrop(
      remixedBoard,
      moduleDndId(2, 10),
      moduleDndId(6, 10),
    );

    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        '"Shared" is placed in Remixer, so it cannot be moved into Source. Modules are only reordered within their own course.',
    });
  });
});

/**
 * A borrowed module is one shown on a course's board through a remix but
 * owned by another course (`module.owner.id !== courseBoard.course.id`).
 * Content authority follows the owner: a lesson may only be added to or
 * removed from a borrowed module on the OWNER's board, though the borrowing
 * course may still reorder the borrowed module's position on its own rail —
 * that is layout, not content.
 */
describe('resolveDrop — borrowed modules', () => {
  const owner = { id: 6, name: '3D Airmanship' };
  const borrowed = mod(10, 'Weather', [lesson(55, 'Crosswinds')], owner);
  const own = mod(20, 'Intro', [lesson(56, 'Welcome')], {
    id: 2,
    name: 'ITPS',
  });
  const remixBoard: OrgEditorBoard = [
    courseBoard(6, '3D Airmanship', [borrowed]),
    courseBoard(2, 'ITPS', [own, borrowed]),
  ];

  it('refuses a library lesson dropped on a borrowed module, naming where it is edited', () => {
    expect(
      resolveDrop(remixBoard, libraryLessonDndId(99), containerDndId(2, 10)),
    ).toEqual({
      kind: 'forbidden',
      reason:
        '"Weather" is edited in 3D Airmanship — ITPS only borrows it. Add the lesson to it from 3D Airmanship’s board, or drop it on one of ITPS’s own modules.',
    });
  });

  it('refuses moving a placed lesson INTO a borrowed module', () => {
    expect(
      resolveDrop(
        remixBoard,
        lessonDndId(2, 56),
        containerDndId(2, 10),
        from(20),
      ),
    ).toMatchObject({
      kind: 'forbidden',
      reason: expect.stringContaining('is edited in 3D Airmanship'),
    });
  });

  it('refuses moving a placed lesson OUT OF a borrowed module', () => {
    expect(
      resolveDrop(
        remixBoard,
        lessonDndId(2, 55),
        containerDndId(2, 20),
        from(10),
      ),
    ).toEqual({
      kind: 'forbidden',
      reason:
        '"Weather" is edited in 3D Airmanship — ITPS only borrows it, so its lessons are arranged there.',
    });
  });

  it('still lets the borrowing course reorder the borrowed module on its own rail', () => {
    expect(
      resolveDrop(remixBoard, moduleDndId(2, 10), moduleDndId(2, 20)),
    ).toEqual({
      kind: 'reorder-module',
      courseId: 2,
      moduleId: 10,
      overModuleId: 20,
    });
  });

  it('lets the OWNER’s column do everything it could before', () => {
    expect(
      resolveDrop(remixBoard, libraryLessonDndId(99), containerDndId(6, 10)),
    ).toEqual({
      kind: 'link',
      moduleId: 10,
      lessonId: 99,
    });
  });
});

/**
 * Final review, Critical #2. Whole-course remixing makes a lesson that sits
 * in a course's OWN module and ALSO in one it borrowed ordinary (the spec's
 * "duplicate lessons are surfaced, not blocked"). A lookup by lesson id
 * lands on whichever module comes first on the board — here the borrowed
 * one, deliberately listed first — so dragging the course's own copy was
 * refused as "edited in <owner>", and the server's UPDATE matched both rows.
 *
 * The drag's pick-up module is therefore an INPUT (`resolveDrop`'s fourth
 * argument, from the sortable's `data.moduleId` at drag start), never a
 * search, and it travels out again as `fromModuleId` so the route can pin
 * one placement.
 */
describe('resolveDrop — duplicate lessons (own copy and borrowed copy)', () => {
  const owner = { id: 6, name: '3D Airmanship' };
  const itps = { id: 2, name: 'ITPS' };
  const CROSSWINDS = 55;
  const BORROWED = 10;
  const OWN = 20;
  const OWN_TOO = 21;
  const borrowed = mod(
    BORROWED,
    'Weather',
    [lesson(CROSSWINDS, 'Crosswinds')],
    owner,
  );
  const own = mod(OWN, 'Intro', [lesson(CROSSWINDS, 'Crosswinds')], itps);
  const ownToo = mod(OWN_TOO, 'Review', [lesson(56, 'Welcome')], itps);
  // Borrowed FIRST, so a first-match search finds the wrong copy.
  const dupBoard: OrgEditorBoard = [
    courseBoard(6, '3D Airmanship', [borrowed]),
    courseBoard(2, 'ITPS', [borrowed, own, ownToo]),
  ];

  it('moves the course’s OWN copy when the drag started on it, naming that module as the source', () => {
    expect(
      resolveDrop(
        dupBoard,
        lessonDndId(2, CROSSWINDS),
        containerDndId(2, OWN_TOO),
        from(OWN),
      ),
    ).toEqual({
      kind: 'move',
      moduleId: OWN_TOO,
      lessonId: CROSSWINDS,
      fromModuleId: OWN,
      overId: containerDndId(2, OWN_TOO),
    });
  });

  it('still refuses the BORROWED copy when the drag started on it', () => {
    expect(
      resolveDrop(
        dupBoard,
        lessonDndId(2, CROSSWINDS),
        containerDndId(2, OWN_TOO),
        from(BORROWED),
      ),
    ).toEqual({
      kind: 'forbidden',
      reason:
        '"Weather" is edited in 3D Airmanship — ITPS only borrows it, so its lessons are arranged there.',
    });
  });

  /**
   * The OVER side has no pick-up data, so it is resolved by search — but a
   * borrowed module registers no droppables (its lessons render read-only),
   * so an `over` lesson id can only ever be the course's own copy. The
   * search prefers own modules for exactly that reason; a first-match
   * search would land on the borrowed copy and refuse the drop as adding to
   * a borrowed module.
   */
  it('resolves an OVER lesson id to the course’s own copy, not the borrowed one listed first', () => {
    expect(
      resolveDrop(
        dupBoard,
        lessonDndId(2, 56),
        lessonDndId(2, CROSSWINDS),
        from(OWN_TOO),
      ),
    ).toEqual({
      kind: 'move',
      moduleId: OWN,
      lessonId: 56,
      fromModuleId: OWN_TOO,
      overId: lessonDndId(2, CROSSWINDS),
    });
  });

  /**
   * After `onDragOver` carries a lesson into another module live, the board
   * no longer shows it in its pick-up module — the resolution must still
   * work off the pick-up module (for authority) and find the lesson where it
   * now sits (for its name).
   */
  it('resolves a drop after the lesson was carried out of its pick-up module live', () => {
    const carried: OrgEditorBoard = [
      courseBoard(6, '3D Airmanship', [borrowed]),
      courseBoard(2, 'ITPS', [
        borrowed,
        mod(OWN, 'Intro', [], itps),
        mod(
          OWN_TOO,
          'Review',
          [lesson(56, 'Welcome'), lesson(CROSSWINDS, 'Crosswinds')],
          itps,
        ),
      ]),
    ];
    expect(
      resolveDrop(
        carried,
        lessonDndId(2, CROSSWINDS),
        lessonDndId(2, 56),
        from(OWN),
      ),
    ).toEqual({
      kind: 'move',
      moduleId: OWN_TOO,
      lessonId: CROSSWINDS,
      fromModuleId: OWN,
      overId: lessonDndId(2, 56),
    });
  });
});

/**
 * Task 6: library-side drops — filing a library lesson into a discipline
 * module or Untitled group, reordering discipline modules, and refusing
 * across-discipline drags. `library` is `resolveDrop`'s 5th argument; every
 * test below either supplies `libraryFixture()` or deliberately omits it to
 * prove the "no library, no resolution" rule.
 */
describe('resolveDrop — library-side drops', () => {
  it('files a library lesson into a module over its container', () => {
    // Spec row: library lesson 1 over libraryContainerDndId(8).
    expect(
      resolveDrop(
        board,
        libraryLessonDndId(L1),
        libraryContainerDndId(ADVANCED_MODULE),
        undefined,
        libraryFixture(),
      ),
    ).toEqual({
      kind: 'library-move',
      lessonId: L1,
      disciplineId: WEATHER,
      disciplineModuleId: ADVANCED_MODULE,
      overId: libraryContainerDndId(ADVANCED_MODULE),
    });
  });

  it('reorders a library lesson against another lesson in the SAME module', () => {
    // Spec row: library lesson 1 over libraryLessonDndId(2) — L1 and L2 are
    // both in Basics (7), so this is a reorder, not a transfer.
    expect(
      resolveDrop(
        board,
        libraryLessonDndId(L1),
        libraryLessonDndId(L2),
        undefined,
        libraryFixture(),
      ),
    ).toEqual({
      kind: 'library-move',
      lessonId: L1,
      disciplineId: WEATHER,
      disciplineModuleId: BASICS_MODULE,
      overId: libraryLessonDndId(L2),
    });
  });

  it('files a library lesson into its discipline’s Untitled group', () => {
    // Spec row: library lesson 1 over libraryUntitledDndId(4).
    expect(
      resolveDrop(
        board,
        libraryLessonDndId(L1),
        libraryUntitledDndId(WEATHER),
        undefined,
        libraryFixture(),
      ),
    ).toEqual({
      kind: 'library-move',
      lessonId: L1,
      disciplineId: WEATHER,
      disciplineModuleId: null,
      overId: libraryUntitledDndId(WEATHER),
    });
  });

  it('refuses a library lesson dragged into another discipline’s module, naming both', () => {
    // Spec row: library lesson 1 over libraryModuleDndId(20) (Navigation).
    const result = resolveDrop(
      board,
      libraryLessonDndId(L1),
      libraryModuleDndId(NAV_MODULE),
      undefined,
      libraryFixture(),
    );

    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        '"L1" is in Weather. Lessons stay in their discipline — file it into one of Weather’s modules, or drop it on a course module to teach it there.',
    });
  });

  it('still links a library lesson into a course container, unaffected by the library-side rules', () => {
    // Spec row: library lesson 1 over a course container — unchanged
    // behaviour, re-asserted with the library-side fixture in play too.
    expect(
      resolveDrop(board, libraryLessonDndId(L1), containerDndId(1, CIRCUITS)),
    ).toEqual({
      kind: 'link',
      moduleId: CIRCUITS,
      lessonId: L1,
    });
  });

  it('reorders a discipline module against another module of the same discipline', () => {
    // Spec row: library module 7 over libraryModuleDndId(8).
    expect(
      resolveDrop(
        board,
        libraryModuleDndId(BASICS_MODULE),
        libraryModuleDndId(ADVANCED_MODULE),
        undefined,
        libraryFixture(),
      ),
    ).toEqual({
      kind: 'reorder-library-module',
      disciplineId: WEATHER,
      moduleId: BASICS_MODULE,
      overModuleId: ADVANCED_MODULE,
    });
  });

  it('refuses a discipline module dragged into another discipline’s module, naming both', () => {
    // Spec row: library module 7 over libraryModuleDndId(20) (Navigation).
    const result = resolveDrop(
      board,
      libraryModuleDndId(BASICS_MODULE),
      libraryModuleDndId(NAV_MODULE),
      undefined,
      libraryFixture(),
    );

    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        '"Basics" is in Weather. Modules stay in their discipline; it cannot be moved into Navigation.',
    });
  });

  it('refuses a discipline module dragged onto a course module', () => {
    // Spec row: library module 7 over a course module.
    const result = resolveDrop(
      board,
      libraryModuleDndId(BASICS_MODULE),
      moduleDndId(1, CIRCUITS),
      undefined,
      libraryFixture(),
    );

    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        'A discipline module organises the library; it cannot be added to a course. Drag its lessons into the course instead.',
    });
  });

  it('answers null for a library-side over id when no library was supplied', () => {
    // Spec row: resolveDrop without `library` and a library-side over id.
    expect(
      resolveDrop(
        board,
        libraryLessonDndId(L1),
        libraryContainerDndId(ADVANCED_MODULE),
      ),
    ).toBeNull();
    // A library-module drag is equally unresolvable without the library.
    expect(
      resolveDrop(
        board,
        libraryModuleDndId(BASICS_MODULE),
        libraryModuleDndId(ADVANCED_MODULE),
      ),
    ).toBeNull();
  });

  /**
   * The org-level `library.untitled` is the bag of unassigned lessons. A
   * lesson in it may be dragged into any discipline (onto a module, that
   * discipline's own Untitled group, or one of its lesson cards), which
   * assigns the discipline; a disciplined lesson may be dropped back onto
   * the bag, which clears it. Only the bag changes a lesson's discipline —
   * a direct discipline-to-discipline drop stays refused by name.
   */
  describe('the Untitled bag', () => {
    it('assigns a discipline when a bag lesson is dropped on one of its modules', () => {
      expect(
        resolveDrop(
          board,
          libraryLessonDndId(ORPHAN),
          libraryContainerDndId(ADVANCED_MODULE),
          undefined,
          libraryFixture(),
        ),
      ).toEqual({
        kind: 'library-move',
        lessonId: ORPHAN,
        disciplineId: WEATHER,
        disciplineModuleId: ADVANCED_MODULE,
        overId: libraryContainerDndId(ADVANCED_MODULE),
      });
    });

    it('assigns a discipline when a bag lesson is dropped on that discipline’s Untitled group', () => {
      expect(
        resolveDrop(
          board,
          libraryLessonDndId(ORPHAN),
          libraryUntitledDndId(WEATHER),
          undefined,
          libraryFixture(),
        ),
      ).toEqual({
        kind: 'library-move',
        lessonId: ORPHAN,
        disciplineId: WEATHER,
        disciplineModuleId: null,
        overId: libraryUntitledDndId(WEATHER),
      });
    });

    it('assigns a discipline when a bag lesson is dropped on one of its lesson cards, into that card’s box', () => {
      expect(
        resolveDrop(
          board,
          libraryLessonDndId(ORPHAN),
          libraryLessonDndId(L2),
          undefined,
          libraryFixture(),
        ),
      ).toEqual({
        kind: 'library-move',
        lessonId: ORPHAN,
        disciplineId: WEATHER,
        disciplineModuleId: BASICS_MODULE,
        overId: libraryLessonDndId(L2),
      });
    });

    it('releases a disciplined lesson to the bag when dropped on the org-level Untitled column', () => {
      expect(
        resolveDrop(
          board,
          libraryLessonDndId(L1),
          libraryUntitledDndId(UNTITLED_DISCIPLINE_ID),
          undefined,
          libraryFixture(),
        ),
      ).toEqual({
        kind: 'library-move',
        lessonId: L1,
        disciplineId: null,
        disciplineModuleId: null,
        overId: libraryUntitledDndId(UNTITLED_DISCIPLINE_ID),
      });
    });

    it('releases a disciplined lesson to the bag when dropped on a bag lesson’s card', () => {
      expect(
        resolveDrop(
          board,
          libraryLessonDndId(L1),
          libraryLessonDndId(ORPHAN),
          undefined,
          libraryFixture(),
        ),
      ).toMatchObject({
        kind: 'library-move',
        lessonId: L1,
        disciplineId: null,
        disciplineModuleId: null,
      });
    });

    it('releases a disciplined lesson to the bag when dropped on the org-level column itself — the bag registers no inner droppable', () => {
      expect(
        resolveDrop(
          board,
          libraryLessonDndId(L1),
          disciplineDndId(UNTITLED_DISCIPLINE_ID),
          undefined,
          libraryFixture(),
        ),
      ).toEqual({
        kind: 'library-move',
        lessonId: L1,
        disciplineId: null,
        disciplineModuleId: null,
        overId: disciplineDndId(UNTITLED_DISCIPLINE_ID),
      });
    });

    it('refuses a bag lesson dropped back on the bag column — it changes nothing', () => {
      expect(
        resolveDrop(
          board,
          libraryLessonDndId(ORPHAN),
          disciplineDndId(UNTITLED_DISCIPLINE_ID),
          undefined,
          libraryFixture(),
        ),
      ).toMatchObject({
        kind: 'forbidden',
        reason: expect.stringContaining('already in Untitled'),
      });
    });

    it('refuses a bag lesson dropped back on the bag — it changes nothing', () => {
      expect(
        resolveDrop(
          board,
          libraryLessonDndId(ORPHAN),
          libraryUntitledDndId(UNTITLED_DISCIPLINE_ID),
          undefined,
          libraryFixture(),
        ),
      ).toEqual({
        kind: 'forbidden',
        reason:
          '"Orphan" is already in Untitled. Drag it onto a discipline’s module to file it there, or onto a course module to teach it.',
      });
    });
  });

  it('refuses a library lesson dragged onto another discipline’s LESSON, naming both', () => {
    // Coverage gap (Ruling 4): the over side is a `library-lesson`, not a
    // `library-module`/`library-container`/`library-untitled` — the cross-
    // discipline refusal must fire off a lesson target too, not just a
    // module/container/untitled one.
    const result = resolveDrop(
      board,
      libraryLessonDndId(L1),
      libraryLessonDndId(L30),
      undefined,
      libraryFixture(),
    );

    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        '"L1" is in Weather. Lessons stay in their discipline — file it into one of Weather’s modules, or drop it on a course module to teach it there.',
    });
  });

  /**
   * Fix round 1: a pointer dragging a module HEADER spends most of its time
   * over SIBLING modules' lesson cards and containers, not their headers —
   * dnd-kit reports those as `over` far more often than the header itself.
   * These must resolve the same as a direct `library-module` target: find
   * the module that owns the hovered card (never via `disciplineModuleId`)
   * and reorder against IT, or refuse across disciplines the same way.
   */
  describe('a library module dragged over a sibling module’s cards, not its header', () => {
    it('reorders against the module owning the hovered LESSON', () => {
      // L6 lives in Advanced (8) — hovering its card while dragging Basics
      // (7) must resolve exactly as dropping on Advanced's own header would.
      expect(
        resolveDrop(
          board,
          libraryModuleDndId(BASICS_MODULE),
          libraryLessonDndId(L6),
          undefined,
          libraryFixture(),
        ),
      ).toEqual({
        kind: 'reorder-library-module',
        disciplineId: WEATHER,
        moduleId: BASICS_MODULE,
        overModuleId: ADVANCED_MODULE,
      });
    });

    it('answers null for a module dragged over its OWN container', () => {
      expect(
        resolveDrop(
          board,
          libraryModuleDndId(BASICS_MODULE),
          libraryContainerDndId(BASICS_MODULE),
          undefined,
          libraryFixture(),
        ),
      ).toBeNull();
    });

    it('refuses a module dragged over another discipline’s LESSON card, naming both disciplines', () => {
      expect(
        resolveDrop(
          board,
          libraryModuleDndId(BASICS_MODULE),
          libraryLessonDndId(L30),
          undefined,
          libraryFixture(),
        ),
      ).toEqual({
        kind: 'forbidden',
        reason:
          '"Basics" is in Weather. Modules stay in their discipline; it cannot be moved into Navigation.',
      });
    });

    it('answers null for a module dragged over a discipline’s Untitled droppable — Untitled is not a module', () => {
      expect(
        resolveDrop(
          board,
          libraryModuleDndId(BASICS_MODULE),
          libraryUntitledDndId(WEATHER),
          undefined,
          libraryFixture(),
        ),
      ).toBeNull();
    });

    it('answers null for a module dragged over a lesson sitting in a discipline’s Untitled group', () => {
      // L3 sits in Weather's OWN Untitled group — it has no module to
      // reorder against, and nothing to refuse either.
      expect(
        resolveDrop(
          board,
          libraryModuleDndId(BASICS_MODULE),
          libraryLessonDndId(L3),
          undefined,
          libraryFixture(),
        ),
      ).toBeNull();
    });
  });
});

/**
 * A RAIL item (a placed lesson, or a course module) released on a library
 * box that holds no lesson card to land on — an empty discipline module's
 * container, or a discipline's empty Untitled droppable — used to fall
 * through to `resolveOverModule`, which knows nothing of library ids, and
 * answer `null`: a silent snap-back, with the note, announcement and toast
 * every other library-bound rail drop gets all missing. Mutant seen RED:
 * the refusal branches listing `discipline`/`library-lesson` only.
 */
describe('resolveDrop — rail items released on an EMPTY library box', () => {
  const NAV_UNTITLED = NAVIGATION; // Navigation's Untitled group holds nothing.

  it('refuses a placed lesson over an empty library module container, with the library sentence', () => {
    const result = resolveDrop(
      board,
      lessonDndId(1, STALLS),
      libraryContainerDndId(ADVANCED_MODULE),
      from(FUNDAMENTALS),
      libraryFixture(),
    );
    expect(result?.kind).toBe('forbidden');
    const reason = result?.kind === 'forbidden' ? result.reason : '';
    expect(reason).toContain('The library already holds "Stalls"');
    expect(reason).toContain(
      `"${removeLessonLabel('Stalls', 'Fundamentals')}"`,
    );
  });

  it('refuses a placed lesson over an empty Untitled group, with the library sentence', () => {
    const result = resolveDrop(
      board,
      lessonDndId(1, STALLS),
      libraryUntitledDndId(NAV_UNTITLED),
      from(FUNDAMENTALS),
      libraryFixture(),
    );
    expect(result?.kind).toBe('forbidden');
    const reason = result?.kind === 'forbidden' ? result.reason : '';
    expect(reason).toContain('The library already holds "Stalls"');
  });

  it('refuses a placed lesson over a library module header too', () => {
    const result = resolveDrop(
      board,
      lessonDndId(1, STALLS),
      libraryModuleDndId(ADVANCED_MODULE),
      from(FUNDAMENTALS),
      libraryFixture(),
    );
    expect(result?.kind).toBe('forbidden');
    const reason = result?.kind === 'forbidden' ? result.reason : '';
    expect(reason).toContain('The library already holds "Stalls"');
  });

  it('refuses a course module over an empty library module container, with the existing library sentence', () => {
    const result = resolveDrop(
      board,
      moduleDndId(1, FUNDAMENTALS),
      libraryContainerDndId(ADVANCED_MODULE),
      undefined,
      libraryFixture(),
    );
    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        '"Fundamentals" is a module of Two-Week Course, and the library holds lessons, not modules. Drop it on another module in Two-Week Course to reorder it.',
    });
  });

  it('refuses a course module over an empty Untitled group, with the existing library sentence', () => {
    const result = resolveDrop(
      board,
      moduleDndId(1, FUNDAMENTALS),
      libraryUntitledDndId(NAV_UNTITLED),
      undefined,
      libraryFixture(),
    );
    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        '"Fundamentals" is a module of Two-Week Course, and the library holds lessons, not modules. Drop it on another module in Two-Week Course to reorder it.',
    });
  });

  it('refuses a course module over a library module header too', () => {
    const result = resolveDrop(
      board,
      moduleDndId(1, FUNDAMENTALS),
      libraryModuleDndId(ADVANCED_MODULE),
      undefined,
      libraryFixture(),
    );
    expect(result?.kind).toBe('forbidden');
  });
});
