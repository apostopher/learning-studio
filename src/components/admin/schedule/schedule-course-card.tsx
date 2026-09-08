import { GripVertical } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { cn } from '#/lib/cn';

/**
 * One course in the schedule rail — the thing you drag onto a day.
 *
 * Presentational: it renders a course and says how to pick it up. Whether it
 * is currently being dragged is a prop, because the drag context is the
 * container's.
 *
 * The whole card is the drag handle rather than the grip icon alone. The grip
 * is an affordance saying "this moves", but a 16px target inside a card the
 * user has already aimed at is a smaller thing to hit than the card itself.
 */
export const ScheduleCourseCard = ({
  name,
  moduleCount,
  lessonCount,
  isDragging = false,
  dragHandleProps,
  className,
  ...props
}: {
  name: string;
  moduleCount: number;
  lessonCount: number;
  isDragging?: boolean;
  /** dnd-kit's `attributes` + `listeners`, spread onto the card. */
  dragHandleProps?: HTMLAttributes<HTMLElement>;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className'>) => (
  <div
    {...props}
    {...dragHandleProps}
    className={cn(
      'group flex w-full cursor-grab items-start gap-2 rounded-lg border border-gray-6 bg-gray-1 p-3 text-start',
      'transition-colors hover:border-gray-8 hover:bg-gray-2',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9',
      isDragging && 'opacity-40',
      className,
    )}
  >
    <GripVertical
      className="mt-0.5 h-4 w-4 shrink-0 text-tertiary"
      aria-hidden="true"
    />
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="font-medium text-primary text-sm">{name}</span>
      <span className="font-mono text-tertiary text-xs">
        {moduleCount} {moduleCount === 1 ? 'module' : 'modules'} · {lessonCount}{' '}
        {lessonCount === 1 ? 'lesson' : 'lessons'}
      </span>
    </span>
  </div>
);
