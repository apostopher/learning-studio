import { describe, expect, it } from 'vitest';
import {
  courseRailBoards,
  FLAGSHIP_COURSE_SLUG,
  findFlagshipCourse,
  flagshipRailNote,
  railModules,
} from '#/lib/flagship-course';

describe('findFlagshipCourse', () => {
  it('finds the course by the flagship slug', () => {
    const boards = [
      { course: { id: 2, name: 'ITPS', slug: 'itps' } },
      { course: { id: 6, name: '3D Airmanship', slug: FLAGSHIP_COURSE_SLUG } },
    ];
    expect(findFlagshipCourse(boards)).toEqual({
      id: 6,
      name: '3D Airmanship',
      slug: '3d-airmanship',
    });
  });
  it('is null when no course carries the slug — the button then renders nowhere', () => {
    expect(
      findFlagshipCourse([{ course: { id: 2, name: 'ITPS', slug: 'itps' } }]),
    ).toBeNull();
  });

  /**
   * The flagship is not a column on the editor's rail: its lessons are the
   * library (filed under the 3D Airmanship discipline) and the other courses
   * remix from it. Mutant: rendering `board` unfiltered — the flagship then
   * sits beside the courses that borrow from it, twice on screen.
   */
  it('courseRailBoards drops the flagship and keeps every other board, in order', () => {
    const boards = [
      { course: { id: 2, name: 'ITPS', slug: 'itps' } },
      { course: { id: 6, name: '3D Airmanship', slug: FLAGSHIP_COURSE_SLUG } },
      { course: { id: 3, name: 'Evaluators', slug: 'evaluators' } },
    ];
    expect(courseRailBoards(boards).map((b) => b.course.id)).toEqual([2, 3]);
    // No flagship → nothing to drop.
    expect(courseRailBoards(boards.slice(0, 1))).toEqual(boards.slice(0, 1));
  });
});

describe('railModules', () => {
  const board = {
    modules: [
      { id: 10, owner: { id: 6 } },
      { id: 21, owner: { id: 2 } },
      { id: 11, owner: { id: 6 } },
      { id: 30, owner: { id: 3 } },
    ],
  };

  /**
   * Every course borrows the whole flagship, so drawing its modules in every
   * column would repeat the same seven modules down the rail. Mutant: the
   * column drawing `courseBoard.modules` unfiltered.
   */
  it('drops the modules the course borrows from the flagship, keeping the rest in order', () => {
    expect(railModules(board, 6).map((m) => m.id)).toEqual([21, 30]);
  });

  it('keeps every module when there is no flagship', () => {
    expect(railModules(board, null)).toEqual(board.modules);
  });
});

describe('flagshipRailNote', () => {
  const flagship = { id: 6, name: '3D Airmanship' };

  it('says the column includes every flagship module', () => {
    expect(flagshipRailNote(flagship, 2)).toBe(
      'Includes all 3D Airmanship modules',
    );
  });

  it('says nothing without a flagship, or in the flagship itself', () => {
    expect(flagshipRailNote(null, 2)).toBeNull();
    expect(flagshipRailNote(flagship, 6)).toBeNull();
  });
});
