import { Link } from '@tanstack/react-router';

type LessonLike = { slug: string; name: string };

type LessonLinkProps = {
  moduleSlug: string;
  lesson: LessonLike;
  rank: number;
  isActive: boolean;
};

export const LessonLink = ({
  moduleSlug,
  lesson,
  rank,
  isActive,
}: LessonLinkProps) => {
  const classes = [
    'sidebar-focus-ring',
    'flex items-start gap-2',
    'ps-sidebar-lesson-indent pe-sidebar-row-inline py-sidebar-row-block',
    'text-sm',
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
      <span
        aria-hidden="true"
        className="tabular-nums text-gray-10 text-xs font-medium shrink-0 pt-0.5"
      >
        {String(rank).padStart(2, '0')}
      </span>
      <span className="min-w-0 break-words">{lesson.name}</span>
    </Link>
  );
};
