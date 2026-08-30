import { describe, expect, it } from 'vitest';
import type {
  BoardLesson,
  BoardModule,
  CourseBoard,
  OrgEditorBoard,
} from '#/lib/admin-schemas';
import {
  containerDndId,
  disciplineDndId,
  lessonDndId,
  libraryLessonDndId,
  moduleDndId,
} from '#/lib/dnd-ids';
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
const RADIO_CALLS = 200;
const WAKE_TURBULENCE = 500;

const FUNDAMENTALS = 10;
const CIRCUITS = 11;
const BASICS = 20;

const board: OrgEditorBoard = [
  courseBoard(1, 'Two-Week Course', [
    mod(FUNDAMENTALS, 'Fundamentals', [lesson(STALLS, 'Stalls')]),
    mod(CIRCUITS, 'Circuits', [lesson(GO_AROUND, 'Go-around')]),
  ]),
  courseBoard(2, 'Mini Course', [
    mod(BASICS, 'Basics', [lesson(RADIO_CALLS, 'Radio Calls')]),
  ]),
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

  it('reorders a placed lesson onto a slot in its own module', () => {
    // A same-module drop is a `move` too — the over id names the slot, which
    // is why `overId` is carried through rather than discarded.
    expect(
      resolveDrop(board, lessonDndId(STALLS), lessonDndId(GO_AROUND)),
    ).toEqual({
      kind: 'move',
      moduleId: CIRCUITS,
      lessonId: STALLS,
      overId: lessonDndId(GO_AROUND),
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
