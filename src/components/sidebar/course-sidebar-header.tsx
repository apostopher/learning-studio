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
    <div className="flex items-center gap-2">
      <h2 className="flex-1 min-w-0 text-sm font-semibold text-gray-12 break-words">
        {title}
      </h2>
      <CircularProgress
        value={coursePercent}
        size={24}
        strokeWidth={8}
        ariaLabel={`Course ${title} progress`}
      />
    </div>
    <p className="text-xs text-gray-11">
      {plural(moduleCount, 'module')} · {plural(lessonCount, 'lesson')}
    </p>
  </header>
);
