import type { ReactNode } from 'react';
import { ScrollArea } from '../scroll-area';

/**
 * The course rail's shell: a header carrying an optional action, plus a
 * horizontally-scrolling rail of course columns (`CourseColumn`, passed in
 * as `children`). Mirrors `LessonLibrary`'s shell so the two halves of the
 * editor read as one layout system rather than two.
 *
 * This component only lays out whatever columns it's handed — building the
 * columns, fetching the org's courses, and the drag context are a
 * container's job. `headerAction` is a node for the same reason it is one on
 * `LessonLibrary`: the action is a dialog trigger that must sit inside its
 * own `Dialog.Root`, and a bare callback would put that dialog's open state
 * in this presentational shell.
 */
export const CourseRail = ({
  headerAction,
  children,
}: {
  headerAction?: ReactNode;
  children: ReactNode;
}) => (
  <section className="flex h-full flex-col bg-gray-2">
    <header className="flex items-center justify-between gap-2 border-gray-6 border-b bg-gray-1 px-4 py-3">
      <h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
        Courses
      </h2>
      {headerAction}
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
