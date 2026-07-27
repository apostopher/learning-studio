import { Link } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { ImageIcon } from 'lucide-react';
import type { AdminCourseSummary } from '@/db/admin';
import { OptimizedPicture } from './optimized-picture';

interface CourseTileProps {
  course: AdminCourseSummary;
}

export const CourseTile = ({ course }: CourseTileProps) => {
  const hasCover = Boolean(course.imageUrlWebp ?? course.imageUrlAvif);

  return (
    <Link
      to="/admin/$courseId/editor"
      params={{ courseId: String(course.id) }}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-6 bg-gray-2 transition-colors hover:border-gray-8"
    >
      <div className="aspect-video w-full overflow-hidden bg-gray-3">
        {hasCover ? (
          <OptimizedPicture
            avifUrl={course.imageUrlAvif}
            webpUrl={course.imageUrlWebp}
            alt={`${course.name} cover`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-8">
            <ImageIcon className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-primary">
            {course.name}
          </h3>
          <span className="font-mono text-xs text-secondary">
            /{course.slug}
          </span>
        </div>

        <dl className="flex items-center gap-4 text-sm text-secondary">
          <div className="flex items-baseline gap-1">
            <dt className="sr-only">Modules</dt>
            <dd className="font-medium text-primary">{course.moduleCount}</dd>
            <span>modules</span>
          </div>
          <div className="flex items-baseline gap-1">
            <dt className="sr-only">Lessons</dt>
            <dd className="font-medium text-primary">{course.lessonCount}</dd>
            <span>lessons</span>
          </div>
        </dl>

        <p className="text-xs text-tertiary">
          Updated{' '}
          {formatDistanceToNow(new Date(course.updatedAt), { addSuffix: true })}
        </p>
      </div>
    </Link>
  );
};
