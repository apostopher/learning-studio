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
          // The course index this used to return to is retired: a course is
          // reached from its column in the knowledge library now, so that is
          // where "back" goes.
          to="/admin"
          search={{ section: 'knowledge-library' }}
          className="shrink-0 text-secondary transition-colors hover:text-primary"
          aria-label="Back to the knowledge library"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 truncate text-base font-semibold text-primary">
          {courseName}
        </h1>
        {/*
          This board configures ONE course; the knowledge library composes all
          of them. The named link that used to sit here went to the same place
          as the back arrow above now does — with the course index retired,
          two controls for one destination in one header is one too many, so
          the arrow carries the label instead.
        */}
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
