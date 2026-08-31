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

const board: OrgEditorBoard = [
  courseBoard(1, 'Two-Week Course', [
    mod(FUNDAMENTALS, 'Fundamentals', [
      lesson(STALLS, 'Stalls'),
      lesson(TAXIING, 'Taxiing'),
    ]),
    mod(CIRCUITS, 'Circuits', [lesson(GO_AROUND, 'Go-around')]),
  ]),
  courseBoard(2, 'Mini Course', [
    mod(BASICS, 'Basics', [lesson(RADIO_CALLS, 'Radio Calls')]),
  ]),
  // A course with NO modules — the only state in which the `course` drop
  // target is rendered.
  courseBoard(3, 'Weekend Refresher', []),
];

describe('resolveDrop — the allowed drops', () => {
  it('links a library lesson into the module it was dropped on', () => {
    // Mutant seen RED: `moduleId: to.courseBoard.modules[0].id` — links into
    // the course's FIRST module instead of the hovered one. Right shape,
    // right course, wrong module; only asserting the exact module catches it.
    expect(
      resolveDrop(
        board,
        libraryLessonDndId(WAKE_TURBULENCE),
        containerDndId(CIRCUITS),
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
      resolveDrop(board, lessonDndId(STALLS), containerDndId(CIRCUITS)),
    ).toEqual({
      kind: 'move',
      moduleId: CIRCUITS,
      lessonId: STALLS,
      overId: containerDndId(CIRCUITS),
    });
  });

  it('moves a placed lesson onto a named slot in a sibling module', () => {
    // Round-1 review (Important 1): this test used to claim it covered a
    // same-module reorder, but STALLS is in Fundamentals and GO_AROUND is in
    // Circuits — its own `moduleId: CIRCUITS` assertion proved it was a
    // cross-module drop. The same-module row is now covered below.
    expect(
      resolveDrop(board, lessonDndId(STALLS), lessonDndId(GO_AROUND)),
    ).toEqual({
      kind: 'move',
      moduleId: CIRCUITS,
      lessonId: STALLS,
      overId: lessonDndId(GO_AROUND),
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
      resolveDrop(board, lessonDndId(STALLS), lessonDndId(TAXIING)),
    ).toEqual({
      kind: 'move',
      moduleId: FUNDAMENTALS,
      lessonId: STALLS,
      overId: lessonDndId(TAXIING),
    });
  });

  it('reorders a module against another module of the same course', () => {
    // Mutant seen RED: the two ids swapped —
    // `{ moduleId: to.module.id, overModuleId: from.module.id }`. Both fields
    // are present and plausible, and the reorder runs backwards.
    expect(
      resolveDrop(board, moduleDndId(FUNDAMENTALS), moduleDndId(CIRCUITS)),
    ).toEqual({
      kind: 'reorder-module',
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
      lessonDndId(STALLS),
      containerDndId(BASICS),
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
      moduleDndId(FUNDAMENTALS),
      moduleDndId(BASICS),
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
    const result = resolveDrop(board, lessonDndId(STALLS), disciplineDndId(7));

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
    const result = resolveDrop(board, lessonDndId(STALLS), disciplineDndId(7));

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
      containerDndId(BASICS),
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
        containerDndId(999),
      ),
    ).toBeNull();
    // Dropped on nothing, expressed as the empty over id dnd-kit reports.
    expect(resolveDrop(board, lessonDndId(STALLS), '')).toBeNull();
    // Dropped back on itself.
    expect(
      resolveDrop(board, moduleDndId(FUNDAMENTALS), moduleDndId(FUNDAMENTALS)),
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
    const result = resolveDrop(board, lessonDndId(STALLS), courseDndId(3));

    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        '"Stalls" is placed in Two-Week Course, and a placed lesson only moves between modules of its own course. Drag it from the library to add it to Weekend Refresher as well.',
    });
  });

  it('refuses a placed lesson dropped on its OWN course with the module reason', () => {
    const result = resolveDrop(board, lessonDndId(STALLS), courseDndId(1));

    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        "Drop the lesson on one of Two-Week Course's modules — a lesson sits inside a module, not loose in the course.",
    });
  });

  it('refuses a module dropped on another course', () => {
    const result = resolveDrop(
      board,
      moduleDndId(FUNDAMENTALS),
      courseDndId(3),
    );

    expect(result).toEqual({
      kind: 'forbidden',
      reason:
        '"Fundamentals" belongs to Two-Week Course, and modules are only reordered within their own course — they cannot be moved into Weekend Refresher.',
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
