import type { ReactNode } from 'react';
import { ScrollArea } from '../scroll-area';

/**
 * The library pane's shell: a header, plus a rail of discipline columns
 * (`DisciplineColumn`) that scrolls horizontally while each column scrolls
 * its own lessons vertically. This component only lays out whatever columns
 * it's handed as `children` — building the columns themselves, the
 * "Untitled" grouping, and the drag context are a container's job.
 */
export const LessonLibrary = ({ children }: { children: ReactNode }) => (
  <section className="flex h-full flex-col bg-gray-2">
    <header className="border-b border-gray-6 bg-gray-1 px-4 py-3">
      <h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
        Library
      </h2>
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
