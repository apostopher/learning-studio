type CourseSidebarHeaderProps = {
  title: string;
  moduleCount: number;
  lessonCount: number;
};

const plural = (n: number, singular: string) =>
  `${n} ${singular}${n === 1 ? '' : 's'}`;

export const CourseSidebarHeader = ({
  title,
  moduleCount,
  lessonCount,
}: CourseSidebarHeaderProps) => (
  <header className="flex flex-col gap-sidebar-row-gap px-sidebar-row-inline py-sidebar-row-block">
    <h2 className="text-sm font-semibold text-gray-12 break-words">{title}</h2>
    <p className="text-xs text-gray-11">
      {plural(moduleCount, 'module')} · {plural(lessonCount, 'lesson')}
    </p>
  </header>
);
