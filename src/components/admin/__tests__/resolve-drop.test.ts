import { describe, expect, it } from 'vitest';
import type {
  BoardLesson,
  BoardModule,
  CourseBoard,
  OrgEditorBoard,
} from '#/lib/admin-schemas';
import {
  containerDndId,
  courseDndId,
  disciplineDndId,
  lessonDndId,
  libraryLessonDndId,
  moduleDndId,
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
