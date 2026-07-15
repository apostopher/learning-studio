import type { BoardLesson } from '@/lib/admin-schemas';
import { cn } from '@/lib/cn';

export const LessonCard = ({ lesson }: { lesson: BoardLesson }) => {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2.5 text-sm text-gray-12">
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          lesson.isAvailable ? 'bg-apple-9' : 'bg-gray-7',
        )}
        aria-hidden="true"
      />
      <span className="truncate">{lesson.name}</span>
    </div>
  );
};
