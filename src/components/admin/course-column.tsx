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
}: {
  course: BoardCourse;
  children: ReactNode;
  onEditCourse?: () => void;
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
    </header>

    <ScrollArea
      orientation="vertical"
      className="flex-1"
      viewportClassName="h-full"
    >
      <Accordion.Root multiple className="flex flex-col">
        {children}
      </Accordion.Root>
    </ScrollArea>
  </section>
);
