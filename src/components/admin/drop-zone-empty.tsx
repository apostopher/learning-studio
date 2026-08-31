import type { ReactNode } from 'react';
import { cn } from '#/lib/cn';

/**
 * An empty region that is also a drop target: a dashed outline enclosing a
 * sentence, and optionally an action.
 *
 * The outline is the point. An empty module and an empty course both used to
 * be a line of grey text with no edges, which reads as "nothing here" rather
 * than "put something here" — and gives a dragged lesson no visible target to
 * aim at. A bordered region with real height says where the drop lands before
 * the drop is attempted.
 *
 * `isOver` is the caller's, not this component's: the droppable that decides
 * it lives one level up, and this stays pure.
 */
export const DropZoneEmpty = ({
  message,
  action,
  isOver = false,
  className,
}: {
  message: string;
  /** An escape hatch out of the empty state, when there is one. */
  action?: ReactNode;
  /** Whether a drag is currently over the region this fills. */
  isOver?: boolean;
  className?: string;
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center transition-colors',
      isOver
        ? 'border-apple-9 bg-apple-3 text-primary'
        : 'border-gray-7 text-tertiary',
      className,
    )}
  >
    <p className="text-pretty text-xs">{message}</p>
    {action}
  </div>
);
