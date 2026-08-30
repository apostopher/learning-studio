import type { ReactNode } from 'react';
import { ScrollArea } from '../scroll-area';
import { AddCourseButton } from './add-course-button';

/**
 * The course rail's shell: a header with a "New course" action, plus a
 * horizontally-scrolling rail of course columns (`CourseColumn`, passed in
 * as `children`). Mirrors `LessonLibrary`'s shell so the two halves of the
 * editor read as one layout system rather than two.
 *
 * This component only lays out whatever columns it's handed — building the
 * columns, fetching the org's courses, and the drag context are a
 * container's job.
 */
export const CourseRail = ({
  onNewCourse,
  children,
}: {
  onNewCourse?: () => void;
  children: ReactNode;
}) => (
  <section className="flex h-full flex-col bg-gray-2">
    <header className="flex items-center justify-between gap-2 border-b border-gray-6 bg-gray-1 px-4 py-3">
      <h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
        Courses
      </h2>
      {onNewCourse && <AddCourseButton onClick={onNewCourse} />}
    </header>
    <ScrollArea
      orientation="horizontal"
      className="flex-1"
      viewportClassName="h-full"
    >
      <div className="flex h-full items-start gap-4 p-4">{children}</div>
    </ScrollArea>
  </section>
);
