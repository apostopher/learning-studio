import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { CourseBoard as CourseBoardData } from '@/lib/admin-schemas';
import { ModuleColumn } from './module-column';

export const CourseBoard = ({ board }: { board: CourseBoardData }) => {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-gray-6 px-4 py-3">
        <Link
          to="/admin"
          className="shrink-0 text-gray-11 transition-colors hover:text-gray-12"
          aria-label="Back to courses"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 truncate text-base font-semibold text-gray-12">
          {board.course.name}
        </h1>
      </header>

      {board.modules.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-11">No modules yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="flex w-max items-start gap-4 p-4">
            {board.modules.map((mod) => (
              <ModuleColumn key={mod.id} module={mod} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
