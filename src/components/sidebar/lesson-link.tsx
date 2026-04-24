import { Link } from '@tanstack/react-router';

type LessonLike = { slug: string; name: string };

type LessonLinkProps = {
  moduleSlug: string;
  lesson: LessonLike;
  isActive: boolean;
};

export const LessonLink = ({
  moduleSlug,
  lesson,
  isActive,
}: LessonLinkProps) => {
  const classes = [
    'sidebar-focus-ring',
    'flex items-center gap-2',
    'ps-sidebar-lesson-indent pe-sidebar-row-inline py-sidebar-row-block',
    'text-sm truncate',
    'rounded-sidebar-row',
    'hover:bg-gray-a3 hover:text-gray-12',
    isActive ? 'sidebar-row-active' : 'text-gray-11',
  ].join(' ');

  return (
    <Link
      to="/modules/$moduleSlug/lessons/$lessonSlug"
      params={{ moduleSlug, lessonSlug: lesson.slug }}
      aria-current={isActive ? 'page' : undefined}
      className={classes}
    >
      <span className="truncate">{lesson.name}</span>
    </Link>
  );
};
