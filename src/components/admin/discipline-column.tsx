import { Accordion } from '@base-ui/react/accordion';
import type { ReactNode } from 'react';
import { ScrollArea } from '../scroll-area';

/**
 * One discipline's column in the library pane: a header naming the
 * discipline and how many lessons it holds, above a vertically scrolling
 * list of lesson cards. Used both for a real discipline and for the
 * leftmost "Untitled" column (lessons with no discipline assigned) — this
 * component doesn't know the difference, it only renders whatever `name` and
 * `children` it's given.
 *
 * `actions` is an optional SUBHEADER, below the name row rather than beside
 * it: the name is truncated to fit and three icon buttons on the same line
 * would eat the width that truncation is already fighting for. It is optional
 * because the "Untitled" column has nothing to act on — there is no discipline
 * there to rename or delete, and a lesson filed under nothing is a triage
 * queue entry, not something to add to on purpose.
 */
export const DisciplineColumn = ({
  name,
  lessonCount,
  actions,
  expandedModuleIds,
  onExpandedModuleIdsChange,
  children,
}: {
  name: string;
  lessonCount: number;
  actions?: ReactNode;
  /**
   * Which modules are open, when the caller drives the accordion.
   *
   * Lifted out of the accordion for the same reason `CourseColumn` lifts it: a
   * closed `Accordion.Panel` is `hidden`, so the droppable inside it measures
   * 0×0 and a dragged lesson can never hit it. The library has to be able to
   * open a module a drag is hovering, which it can only do from outside.
   * Omit both props and the accordion stays uncontrolled — Base UI reads
   * `value={undefined}` as uncontrolled, so a caller with no interest in drag
   * never has to manage this state.
   */
  expandedModuleIds?: number[];
  onExpandedModuleIdsChange?: (moduleIds: number[]) => void;
  children: ReactNode;
}) => {
  const lessonNoun = lessonCount === 1 ? 'lesson' : 'lessons';

  return (
    <section className="flex h-full w-96 shrink-0 flex-col rounded-xl border border-gray-6 bg-gray-2">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-xl border-b border-gray-6 bg-gray-3 px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-semibold text-primary text-sm">
          {name}
        </span>
        <span className="shrink-0 text-tertiary text-xs">
          {lessonCount} {lessonNoun}
        </span>
      </header>
      {actions && (
        // A sibling of the header, outside the ScrollArea — so it stays put
        // while the lessons scroll, without needing `sticky` (the column
        // itself never scrolls; only the ScrollArea below does).
        <div className="flex items-center justify-end gap-1 border-gray-6 border-b bg-gray-2 px-2 py-1">
          {actions}
        </div>
      )}
      <ScrollArea
        orientation="vertical"
        className="flex-1"
        viewportClassName="h-full"
      >
        <Accordion.Root
          multiple
          value={expandedModuleIds}
          onValueChange={onExpandedModuleIdsChange}
          className="flex flex-col"
        >
          {children}
        </Accordion.Root>
      </ScrollArea>
    </section>
  );
};
