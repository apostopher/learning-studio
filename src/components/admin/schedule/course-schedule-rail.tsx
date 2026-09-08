import type { ReactNode } from 'react';
import { ScrollArea } from '#/components/scroll-area';

/**
 * The left pane: every course, ready to be dragged onto a day.
 *
 * Courses, not offerings. The rail lists what CAN be run; each offering on
 * the calendar is one dated run of one of these, and the same course appears
 * here once however many times it has been scheduled.
 *
 * Presentational — it lays out whatever cards it is handed. Fetching the
 * courses and making the cards draggable is the container's job.
 */
export const CourseScheduleRail = ({
  children,
  hint,
}: {
  children: ReactNode;
  /**
   * What the pane says about itself. A sentence rather than a label, because
   * "drag a course onto a day" is the only instruction this screen gives and
   * there is nowhere else to put it.
   */
  hint: string;
}) => (
  <section className="flex h-full min-h-0 flex-col border-gray-6 border-e bg-gray-2">
    <header className="flex flex-col gap-0.5 border-gray-6 border-b bg-gray-1 px-4 py-3">
      <h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
        Courses
      </h2>
      <p className="text-secondary text-xs">{hint}</p>
    </header>
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      <div className="flex flex-col gap-2 p-3">{children}</div>
    </ScrollArea>
  </section>
);
