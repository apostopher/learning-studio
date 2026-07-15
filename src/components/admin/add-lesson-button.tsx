import { Plus } from 'lucide-react';

export const AddLessonButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-6 px-3 py-2 text-xs font-medium text-gray-11 transition-colors hover:border-gray-8 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      Add lesson
    </button>
  );
};
