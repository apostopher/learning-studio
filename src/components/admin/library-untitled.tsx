import type { ReactNode } from 'react';
import { cn } from '#/lib/cn';

/**
 * A discipline's root-level lessons: the ones filed in no module, listed
 * straight in the column below its modules with no heading of their own — a
 * lesson outside every module simply sits on the shelf.
 *
 * Still a drop target (the container wraps it), because dragging a lesson
 * here is how it leaves its module. With no root lessons there is nothing to
 * aim at, so while a library lesson is being dragged an empty shelf shows a
 * dashed zone saying what dropping does; at rest it takes no space.
 */
export const LibraryUntitled = ({
  lessonCount,
  showDropZone = false,
  isOver = false,
  children,
}: {
  lessonCount: number;
  /** A library lesson is mid-drag — the only time an empty shelf needs a target. */
  showDropZone?: boolean;
  /** The dragged lesson is over this shelf. */
  isOver?: boolean;
  children?: ReactNode;
}) =>
  lessonCount > 0 ? (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg px-3 pt-1 pb-3 transition-colors',
        isOver && 'bg-gray-3',
      )}
    >
      {children}
    </div>
  ) : showDropZone ? (
    <div className="px-3 pt-1 pb-3">
      <p
        className={cn(
          'rounded-lg border border-dashed px-3 py-3 text-center text-secondary text-xs transition-colors',
          isOver ? 'border-apple-8 bg-gray-3' : 'border-gray-7',
        )}
      >
        Drop here to take it out of its module
      </p>
    </div>
  ) : (
    // Keeps a sliver of droppable height at rest, so the shelf is never a
    // 0×0 target the moment a drag begins and the zone above has to appear.
    <div className="h-3" />
  );
