// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import {
  type ClientRect,
  type Collision,
  type CollisionDetection,
  closestCenter,
  closestCorners,
  pointerWithin,
} from '@dnd-kit/core';
import type { DndType } from '#/lib/dnd-ids';

type Args = Parameters<CollisionDetection>[0];
type Droppables = Args['droppableContainers'];
type Point = { x: number; y: number };

/**
 * How far outside a target still counts as aiming at it. Measured edge to
 * pointer, not centre to centre: a tall module's centre can be 200px from its
 * own bottom edge, so a centre-distance threshold would call a drop just below
 * it a miss while calling a drop across the pane a hit.
 */
const DROP_SLOP_PX = 24;

/** Whether the pointer is inside a droppable's rect, or within `DROP_SLOP_PX` of it. */
export function pointerIsNear(
  rect: ClientRect | undefined,
  pointer: Point,
): boolean {
  if (!rect) return false;
  return (
    pointer.x >= rect.left - DROP_SLOP_PX &&
    pointer.x <= rect.left + rect.width + DROP_SLOP_PX &&
    pointer.y >= rect.top - DROP_SLOP_PX &&
    pointer.y <= rect.top + rect.height + DROP_SLOP_PX
  );
}

const RAIL_TYPES: ReadonlySet<DndType | undefined> = new Set<DndType>([
  'module',
  'lesson',
  'container',
  'course',
]);

const typeOf = (c: Args['droppableContainers'][number]) =>
  c.data.current?.type as DndType | undefined;

/** Physical x, not inline: compared with dnd-kit's physical rects. */
const overRail = (pointer: Point, rail: ClientRect) =>
  pointer.x >= rail.left && pointer.x <= rail.right;

/**
 * Whether a droppable belongs to the pane the pointer is over.
 *
 * Both panes scroll sideways and dnd-kit's rects are not clipped, so a column
 * scrolled out of one pane lies, invisible, underneath the other — and a
 * full-height course column there would catch drops meant for the library.
 * A keyboard drag has no pointer and is offered everything.
 */
export function inPointerPane(
  type: DndType | undefined,
  pointer: Point | null,
  rail: ClientRect | null,
): boolean {
  if (!pointer || !rail) return true;
  return RAIL_TYPES.has(type) === overRail(pointer, rail);
}

/**
 * Drops the courses that hold modules, for a KEYBOARD drag: arrow keys step
 * between modules, so such a course is reached through them and its
 * full-height column would only get in the way.
 */
export function withoutFilledCourses(targets: Droppables): Droppables {
  const filled = new Set(
    targets
      .filter((c) => typeOf(c) === 'module')
      .map((c) => c.data.current?.courseId),
  );
  return targets.filter(
    (c) => typeOf(c) !== 'course' || !filled.has(c.data.current?.courseId),
  );
}

/** For a pointer just outside every target: the one whose edge it is nearest. */
export function nearestToPointer(
  args: Args,
  pointer: Point,
  targets: Droppables,
): Collision[] {
  return closestCorners({
    ...args,
    collisionRect: {
      left: pointer.x,
      right: pointer.x,
      top: pointer.y,
      bottom: pointer.y,
      width: 0,
      height: 0,
    },
    droppableContainers: targets.filter((c) =>
      pointerIsNear(args.droppableRects.get(c.id), pointer),
    ),
  });
}

/**
 * What a dragged LIBRARY MODULE is over.
 *
 * Over the rail the POINTER decides. The card is carried by the handle at its
 * inline end, so its centre is half a card away from the pointer: judged by
 * `closestCenter`, a drop on one course's module resolved to the course (or
 * library card) beside it. Inside a module it is that module; anywhere else in
 * a column it is the course, which appends.
 *
 * In the library the card is sorted among its siblings as any sortable is.
 * `discipline` columns are never a target: `resolveDrop` has nothing to say
 * about them. Everything else stays, so its refusals remain reachable.
 */
export function libraryModuleCollisions(
  args: Args,
  rail: ClientRect | null,
): Collision[] {
  const { pointerCoordinates: pointer } = args;
  const targets = args.droppableContainers.filter(
    (c) =>
      typeOf(c) !== 'discipline' && inPointerPane(typeOf(c), pointer, rail),
  );

  if (!pointer) {
    return closestCenter({
      ...args,
      droppableContainers: withoutFilledCourses(targets),
    });
  }

  if (!rail || !overRail(pointer, rail)) {
    return targets.some((c) =>
      pointerIsNear(args.droppableRects.get(c.id), pointer),
    )
      ? closestCenter({ ...args, droppableContainers: targets })
      : [];
  }

  // `container` wraps a module's whole item, so `module` and `lesson` are
  // inside it. `pointerWithin` answers the innermost first.
  const isArea = (c: (typeof targets)[number]) =>
    typeOf(c) === 'container' || typeOf(c) === 'course';
  const hovered = pointerWithin({
    ...args,
    droppableContainers: targets.filter(isArea),
  });
  if (hovered.length > 0) return hovered;
  return nearestToPointer(
    args,
    pointer,
    targets.filter((c) => typeOf(c) === 'course'),
  );
}
