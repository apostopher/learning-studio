import { BookOpen } from 'lucide-react';
import { OptimizedPicture } from './optimized-picture';

/**
 * One course on the Courses screen: cover, name, and how much it teaches.
 *
 * The tile is not the link — the container wraps it in the router's `Link`
 * with `group`, so this stays hookless and the whole tile lights from the
 * link's hover and keyboard focus: the same orange outline the lesson cards
 * use, colour-only, no lift (a tile is seen every time the screen opens, and
 * motion on a frequently-seen hover reads as lag).
 *
 * The cover is decorative (`alt=""`): the link already names the course.
 */
export const CourseTile = ({
  name,
  imageUrlAvif,
  imageUrlWebp,
  moduleCount,
  lessonCount,
}: {
  name: string;
  imageUrlAvif: string | null;
  imageUrlWebp: string | null;
  moduleCount: number;
  lessonCount: number;
}) => {
  const hasCover = Boolean(imageUrlWebp ?? imageUrlAvif);
  const modules = `${moduleCount} ${moduleCount === 1 ? 'module' : 'modules'}`;
  const lessons = `${lessonCount} ${lessonCount === 1 ? 'lesson' : 'lessons'}`;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-6 bg-gray-2 outline outline-2 outline-offset-2 outline-transparent transition-[outline-color,background-color] duration-150 group-hover:bg-gray-3 group-hover:outline-warning-9 group-focus-visible:outline-warning-9">
      {hasCover ? (
        <OptimizedPicture
          avifUrl={imageUrlAvif}
          webpUrl={imageUrlWebp}
          alt=""
          className="aspect-video w-full object-cover"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-gray-3 text-gray-8">
          <BookOpen className="h-10 w-10" aria-hidden="true" />
        </div>
      )}
      <div className="flex flex-col gap-1 px-4 py-3">
        <h2 className="line-clamp-2 font-semibold text-base text-primary">
          {name}
        </h2>
        <p className="text-secondary text-sm tabular-nums">
          {modules} · {lessons}
        </p>
      </div>
    </article>
  );
};
