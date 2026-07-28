import { Link } from '@tanstack/react-router';
import { ImageIcon } from 'lucide-react';
import { OptimizedPicture } from '#/components/admin/optimized-picture';
import { CircularProgress } from '#/components/ui/circular-progress';
import type { MyCourse } from '#/data-hooks/use-my-courses';

type CourseCardProps = {
  course: MyCourse;
};

export const CourseCard = ({ course }: CourseCardProps) => {
  const hasCover = Boolean(course.imageUrlWebp ?? course.imageUrlAvif);

  return (
    <Link
      to="/course/$courseSlug"
      params={{ courseSlug: course.slug }}
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
          <div
            data-testid="cover-fallback"
            className="flex h-full w-full items-center justify-center text-gray-8"
          >
            <ImageIcon className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 p-5">
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-primary">
          {course.name}
        </h3>
        <CircularProgress
          value={course.percent}
          size={32}
          strokeWidth={8}
          ariaLabel={`${course.name} progress`}
        />
      </div>
    </Link>
  );
};
