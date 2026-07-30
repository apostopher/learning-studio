import { Link } from '@tanstack/react-router';
import type { LessonLock } from '#/lib/lesson-gating';
import { CircularProgress } from '../ui/circular-progress';
import { LessonLockIcon } from './lesson-lock-icon';

type LessonLike = { slug: string; name: string; videoId: string | null };

type LessonLinkProps = {
  courseSlug: string;
  moduleSlug: string;
  lesson: LessonLike;
  rank: number;
  isActive: boolean;
  progressPercent: number;
  /** Absent or `{ kind: 'open' }` renders the row with no lock affordance. */
  lock?: LessonLock;
};

/**
 * The reason a locked row states, as a full sentence — never "Locked".
 * Rendered as visible text inside the link, which makes it part of the row's
 * accessible name: the explanation survives on touch and for screen readers,
 * not just on hover. The lock icon beside it is decorative and aria-hidden, so
 * the reason is announced exactly once.
 */
function lockReason(lock: LessonLock): string | null {
  if (lock.kind === 'lesson-locked') return `Finish ${lock.lessonName} first`;
  if (lock.kind === 'module-locked') {
    return `Finish the ${lock.moduleName} module first`;
  }
  return null;
}

export const LessonLink = ({
  courseSlug,
  moduleSlug,
  lesson,
  rank,
  isActive,
  progressPercent,
  lock,
}: LessonLinkProps) => {
  const reason = lock ? lockReason(lock) : null;

  const classes = [
    'sidebar-focus-ring',
    'flex items-center gap-2',
    'ps-sidebar-lesson-indent pe-sidebar-row-inline py-sidebar-row-block',
    'text-sm',
    'rounded-sidebar-row',
    'hover:bg-gray-a3 hover:text-primary',
    isActive ? 'sidebar-row-active' : 'text-secondary',
  ].join(' ');

  return (
    <Link
      to="/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug"
      params={{ courseSlug, moduleSlug, lessonSlug: lesson.slug }}
      aria-current={isActive ? 'page' : undefined}
      viewTransition
      className={classes}
    >
      <span
        aria-hidden="true"
        className="tabular-nums text-tertiary text-xs font-medium shrink-0"
      >
        {String(rank).padStart(2, '0')}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="break-words">{lesson.name}</span>
        {reason ? (
          <span className="text-xs text-tertiary">{reason}</span>
        ) : null}
      </span>
      {reason ? <LessonLockIcon /> : null}
      <CircularProgress
        value={progressPercent}
        size={20}
        strokeWidth={10}
        ariaLabel={`Lesson ${lesson.name} progress`}
        showLabel={false}
      />
    </Link>
  );
};
