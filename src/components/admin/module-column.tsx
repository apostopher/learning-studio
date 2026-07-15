import { GripVertical } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import type { BoardModule } from '@/lib/admin-schemas';
import { LessonCard } from './lesson-card';

export const ModuleColumn = ({
  module: mod,
  dragHandleProps,
}: {
  module: BoardModule;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
}) => {
  return (
    <section className="course-board__column flex w-80 shrink-0 flex-col rounded-xl border border-gray-6 bg-gray-2">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-xl border-b border-gray-6 bg-gray-3 px-4 py-3">
        <h3 className="min-w-0 truncate text-sm font-semibold text-gray-12">
          {mod.name}
        </h3>
        <button
          type="button"
          aria-label="Drag to reorder module"
          {...dragHandleProps}
          className="-me-1 shrink-0 cursor-grab rounded p-1 text-gray-10 transition-colors hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      <div className="flex flex-col gap-2 p-3">
        {mod.lessons.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-gray-10">
            No lessons
          </p>
        ) : (
          mod.lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))
        )}
      </div>
    </section>
  );
};
