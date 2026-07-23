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
  <header className="flex items-center gap-2 px-sidebar-row-inline py-sidebar-row-block">
    <div className="flex min-w-0 flex-1 flex-col gap-sidebar-row-gap">
      <h2 className="text-sm font-semibold text-gray-12 break-words">{title}</h2>
      <p className="text-xs text-gray-11">
        {plural(moduleCount, 'module')} · {plural(lessonCount, 'lesson')}
      </p>
    </div>
    <CircularProgress
      value={coursePercent}
      size={24}
      strokeWidth={8}
      ariaLabel={`Course ${title} progress`}
    />
  </header>
);
