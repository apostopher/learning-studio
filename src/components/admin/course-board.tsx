import { Link } from '@tanstack/react-router';
import { ArrowLeft, LibraryBig } from 'lucide-react';

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
        {/*
          This board configures ONE course; the knowledge library composes all
          of them. Someone who arrived here from a course tile has no other way
          across but the nav bar, so the sibling surface is named on the screen
          it is a sibling of.
        */}
        <Link
          to="/admin/editor"
          className="ms-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-secondary text-sm transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        >
          <LibraryBig className="h-4 w-4" aria-hidden="true" />
          Knowledge library
        </Link>
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
