import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { CircularProgress } from '../ui/circular-progress';

type CourseSidebarHeaderProps = {
  title: string;
  moduleCount: number;
  lessonCount: number;
  coursePercent: number;
};

const plural = (n: number, singular: string) =>
  `${n} ${singular}${n === 1 ? '' : 's'}`;

export const CourseSidebarHeader = ({
  title,
  moduleCount,
  lessonCount,
  coursePercent,
}: CourseSidebarHeaderProps) => (
  <header className="flex flex-col gap-sidebar-row-gap px-sidebar-row-inline py-sidebar-row-block">
    <Link
      to="/app"
      className="sidebar-focus-ring flex w-fit items-center gap-1 text-xs text-secondary transition-colors hover:text-primary"
    >
      <ArrowLeft className="h-3 w-3" aria-hidden="true" />
      <span className="text-start">Courses</span>
    </Link>
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-sidebar-row-gap">
        <h2 className="text-sm font-semibold text-primary break-words">
          {title}
        </h2>
        <p className="text-xs text-secondary">
          {plural(moduleCount, 'module')} · {plural(lessonCount, 'lesson')}
        </p>
      </div>
      <CircularProgress
        value={coursePercent}
        size={24}
        strokeWidth={8}
        ariaLabel={`Course ${title} progress`}
      />
    </div>
  </header>
);
