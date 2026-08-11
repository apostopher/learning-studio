import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export const CourseBoard = ({
  courseName,
  toolbar,
  children,
}: {
  courseName: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) => {
  return (
    <div className="course-board flex min-h-0 flex-1 flex-col">
      <header className="flex h-[var(--board-header-height)] items-center gap-3 border-b border-gray-6 px-4">
        <Link
          to="/admin"
          className="shrink-0 text-secondary transition-colors hover:text-primary"
          aria-label="Back to courses"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 truncate text-base font-semibold text-primary">
          {courseName}
        </h1>
      </header>

      {toolbar && (
        <div className="flex h-[var(--board-subheader-height)] items-center justify-end border-b border-gray-6 px-4">
          {toolbar}
        </div>
      )}

      {children}
    </div>
  );
};
