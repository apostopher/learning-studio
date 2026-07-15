import { formatDistanceToNow } from 'date-fns';
import type { AdminCourseSummary } from '@/db/admin';

interface CourseTileProps {
  course: AdminCourseSummary;
}

export const CourseTile = ({ course }: CourseTileProps) => {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-gray-6 bg-gray-2 p-5 transition-colors hover:border-gray-8">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-gray-12">{course.name}</h3>
        <span className="font-mono text-xs text-gray-11">/{course.slug}</span>
      </div>

      <dl className="flex items-center gap-4 text-sm text-gray-11">
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">Modules</dt>
          <dd className="font-medium text-gray-12">{course.moduleCount}</dd>
          <span>modules</span>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">Lessons</dt>
          <dd className="font-medium text-gray-12">{course.lessonCount}</dd>
          <span>lessons</span>
        </div>
      </dl>

      <p className="text-xs text-gray-10">
        Updated{' '}
        {formatDistanceToNow(new Date(course.updatedAt), { addSuffix: true })}
      </p>
    </li>
  );
};
