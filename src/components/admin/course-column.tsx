import { Accordion } from '@base-ui/react/accordion';
import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BoardCourse } from '#/lib/admin-schemas';
import { ClampedText } from '../clamped-text';
import { ScrollArea } from '../scroll-area';
import { TooltipIconButton } from '../ui/tooltip-icon-button';

/**
 * One course's column in the course rail: a header naming the course, above
 * an accordion of its modules (`children`, each a `ModuleAccordionItem`).
 *
 * `multiple` lets more than one module stay open at once — an editor
 * comparing or dragging lessons between two modules in the same course
 * shouldn't have opening the second one collapse the first.
 */
export const CourseColumn = ({
  course,
  children,
  onEditCourse,
  configureSlot,
  expandedModuleIds,
  onExpandedModuleIdsChange,
}: {
  course: BoardCourse;
  children: ReactNode;
  onEditCourse?: () => void;
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
      {onEditCourse && (
        <TooltipIconButton label="Edit course" onClick={onEditCourse}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </TooltipIconButton>
      )}
      {configureSlot}
    </header>

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
