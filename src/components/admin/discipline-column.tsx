import type { ReactNode } from 'react';
import { ScrollArea } from '../scroll-area';

/**
 * One discipline's column in the library pane: a header naming the
 * discipline and how many lessons it holds, above a vertically scrolling
 * list of lesson cards. Used both for a real discipline and for the
 * leftmost "Untitled" column (lessons with no discipline assigned) — this
 * component doesn't know the difference, it only renders whatever `name` and
 * `children` it's given.
 */
export const DisciplineColumn = ({
  name,
  lessonCount,
  children,
}: {
  name: string;
  lessonCount: number;
  children: ReactNode;
}) => {
  const lessonNoun = lessonCount === 1 ? 'lesson' : 'lessons';

  return (
    <section className="flex h-full w-80 shrink-0 flex-col rounded-xl border border-gray-6 bg-gray-2">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-xl border-b border-gray-6 bg-gray-3 px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-semibold text-primary text-sm">
          {name}
        </span>
        <span className="shrink-0 text-tertiary text-xs">
          {lessonCount} {lessonNoun}
        </span>
      </header>
      <ScrollArea
        orientation="vertical"
        className="flex-1"
        viewportClassName="h-full"
      >
        <div className="flex flex-col gap-2 p-3">{children}</div>
      </ScrollArea>
    </section>
  );
};
