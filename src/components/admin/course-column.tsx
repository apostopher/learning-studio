import { Accordion } from '@base-ui/react/accordion';
import type { ReactNode } from 'react';
import type { BoardCourse } from '#/lib/admin-schemas';
import { ClampedText } from '../clamped-text';
import { ScrollArea } from '../scroll-area';

/**
 * One course's column in the course rail: a header naming the course, above
 * an accordion of its modules (`children`, each a `ModuleAccordionItem`).
 *
 * `multiple` lets more than one module stay open at once — an editor
 * comparing or dragging lessons between two modules in the same course
 * shouldn't have opening the second one collapse the first.
 *
 * `actions` is a SUBHEADER, below the name row rather than beside it, and it
 * mirrors `DisciplineColumn` on the other side of the splitter so the two
 * halves of the editor read as one layout system. The name is clamped to fit
 * as it is; three icon buttons on the same line would eat the width that
 * clamping is already fighting for.
 */
export const CourseColumn = ({
  course,
  children,
  actions,
  emptySlot,
  configureSlot,
  expandedModuleIds,
  onExpandedModuleIdsChange,
}: {
  course: BoardCourse;
  children: ReactNode;
  /**
   * Course-level actions (a `CourseColumnActions`). Optional because not every
   * caller may perform any of them — one who may not passes nothing rather
   * than a row of dead controls.
   */
  actions?: ReactNode;
  /**
   * Shown in place of the modules when there are none. A slot rather than a
   * built-in message because it carries a drop target and a create action,
   * neither of which a presentational shell can own.
   */
  emptySlot?: ReactNode;
  /**
   * A link to this course's own configure surface, supplied as a node rather
   * than a URL so this component stays router-free (and its render test stays
   * free of a `RouterProvider`). Omitted where there is nowhere to go.
   */
  configureSlot?: ReactNode;
  /**
   * Which modules are open, when the caller drives the accordion.
   *
   * Lifted out of the accordion for one reason: a closed `Accordion.Panel` is
   * `hidden`, so the droppable inside it measures 0×0 and a dragged lesson
   * can never hit it. The editor has to open the module a drag is hovering,
   * which it can only do from outside. Omit both props and the accordion
   * stays uncontrolled — Base UI reads `value={undefined}` as uncontrolled,
   * so a caller with no interest in drag never has to manage this state.
   */
  expandedModuleIds?: number[];
  onExpandedModuleIdsChange?: (moduleIds: number[]) => void;
}) => (
  <section className="flex h-full w-96 shrink-0 flex-col rounded-xl border border-gray-6 bg-gray-2">
    <header className="sticky top-0 z-10 flex items-center gap-1 rounded-t-xl border-b border-gray-6 bg-gray-3 px-3 py-2">
      <ClampedText
        text={course.name}
        lines={1}
        className="min-w-0 flex-1 font-semibold text-primary text-sm"
      />
      {configureSlot}
    </header>
    {actions && (
      // A sibling of the header, outside the ScrollArea, so it stays put while
      // the modules scroll.
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
      {emptySlot && <div className="p-3">{emptySlot}</div>}
    </ScrollArea>
  </section>
);
