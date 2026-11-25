// @vitest-environment node
import type { CollisionDetection, DroppableContainer } from '@dnd-kit/core';
import { describe, expect, it } from 'vitest';
import {
  containerDndId,
  courseDndId,
  type DndType,
  disciplineDndId,
  lessonDndId,
  libraryContainerDndId,
  libraryLessonDndId,
  libraryModuleDndId,
  moduleDndId,
} from '#/lib/dnd-ids';
import {
  inPointerPane,
  libraryModuleCollisions,
} from '../library-module-collision';

type Args = Parameters<CollisionDetection>[0];

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

/** The bug report's screen, in CSS px: two courses that already hold a module. */
const RAIL = rect(525, 55, 680, 700);
const TARGETS: [string, DndType, ReturnType<typeof rect>, number?][] = [
  [disciplineDndId(1), 'discipline', rect(55, 124, 327, 630)],
  [libraryModuleDndId(2), 'library-module', rect(55, 225, 327, 37)],
  [libraryContainerDndId(2), 'library-container', rect(55, 225, 327, 37)],
  [libraryModuleDndId(6), 'library-module', rect(55, 375, 327, 37)],
  [libraryContainerDndId(6), 'library-container', rect(55, 375, 327, 37)],
  // eVTOL's column runs on underneath the rail; so does its lesson.
  [libraryLessonDndId(90), 'library-lesson', rect(407, 192, 307, 60)],
  // A course scrolled off the rail's start edge lies under the library pane.
  [courseDndId(3), 'course', rect(198, 124, 327, 630), 3],
  [courseDndId(1), 'course', rect(539, 124, 327, 630), 1],
  [moduleDndId(1, 10), 'module', rect(539, 406, 327, 37), 1],
  [containerDndId(1, 10), 'container', rect(539, 406, 327, 37), 1],
  [courseDndId(2), 'course', rect(880, 124, 327, 630), 2],
  [moduleDndId(2, 20), 'module', rect(880, 406, 327, 120), 2],
  [containerDndId(2, 20), 'container', rect(880, 406, 327, 120), 2],
  [lessonDndId(2, 200), 'lesson', rect(890, 450, 307, 60), 2],
];

function collide(pointer: { x: number; y: number } | null, card = pointer) {
  const at = card ?? { x: 0, y: 0 };
  const args = {
    droppableContainers: TARGETS.map(([id, type, , courseId]) => ({
      id,
      data: { current: { type, courseId } },
    })) as unknown as DroppableContainer[],
    droppableRects: new Map(TARGETS.map(([id, , r]) => [id, r])),
    pointerCoordinates: pointer,
    // Carried by the handle at its inline end, so the card's centre sits
    // ~150px to the left of the pointer.
    collisionRect: rect(at.x - 318, at.y - 18, 327, 37),
  } as unknown as Args;
  return libraryModuleCollisions(args, RAIL)[0]?.id;
}

describe('dragging a library module over the rail', () => {
  it.each([
    ['just below its last module', 637, 478, courseDndId(1)],
    ['far below its modules', 700, 700, courseDndId(1)],
    ['its cover', 700, 260, courseDndId(1)],
    ['a module, at its start', 560, 425, containerDndId(1, 10)],
    ['a module, in the middle', 637, 425, containerDndId(1, 10)],
    ['a module, at its end', 850, 425, containerDndId(1, 10)],
    ['the next course’s module, at its start', 900, 425, containerDndId(2, 20)],
    ['the next course, below its modules', 900, 640, courseDndId(2)],
    ['a lesson in a module', 1000, 480, containerDndId(2, 20)],
  ])('lands where the pointer is: %s', (_where, x, y, expected) => {
    expect(collide({ x, y })).toBe(expected);
  });

  it('takes the nearest course in the gap between two', () => {
    expect(collide({ x: 869, y: 640 })).toBe(courseDndId(1));
    expect(collide({ x: 877, y: 640 })).toBe(courseDndId(2));
  });

  it('is a miss away from every course', () => {
    expect(collide({ x: 700, y: 80 })).toBeUndefined();
  });
});

describe('dragging a library module over the library', () => {
  it('reorders against its siblings', () => {
    expect(collide({ x: 360, y: 393 })).toMatch(
      /^library-(module|container)-6$/,
    );
  });

  it('is a miss on blank space, even where a course lies underneath', () => {
    expect(collide({ x: 300, y: 600 })).toBeUndefined();
  });
});

describe('dragging a library module by keyboard', () => {
  // Arrow keys step between modules; a course that has some is reached
  // through them, so its full-height column must not win instead.
  it('lands on a module of a course that has any', () => {
    const id = collide(null, { x: 857, y: 480 });
    expect(id).toMatch(/^(module|container)-1-10$/);
  });
  it('lands on an empty course', () => {
    expect(collide(null, { x: 516, y: 439 })).toBe(courseDndId(3));
  });
});

describe('inPointerPane', () => {
  const of = (type: DndType, pointer: { x: number; y: number } | null) =>
    inPointerPane(type, pointer, RAIL);
  it('offers only targets of the pane under the pointer', () => {
    expect(of('course', { x: 300, y: 600 })).toBe(false);
    expect(of('container', { x: 300, y: 600 })).toBe(false);
    expect(of('library-lesson', { x: 300, y: 600 })).toBe(true);
    expect(of('library-lesson', { x: 600, y: 220 })).toBe(false);
    expect(of('discipline', { x: 600, y: 220 })).toBe(false);
    expect(of('module', { x: 600, y: 220 })).toBe(true);
  });
  it('offers everything to a keyboard drag', () => {
    expect(of('course', null)).toBe(true);
    expect(of('library-lesson', null)).toBe(true);
  });
});
