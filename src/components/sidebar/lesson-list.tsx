import type { LessonLock } from '#/lib/lesson-gating';
import type { LessonRing } from './compute-lesson-ring';
import { LessonLink } from './lesson-link';

type LessonLike = { slug: string; name: string };

type LessonListProps = {
  courseSlug: string;
  moduleSlug: string;
  lessons: readonly LessonLike[];
  activeLessonSlug: string | null;
  lessonPercents: Record<string, number>;
  lessonLocks: Record<string, LessonLock>;
  lessonRings?: Record<string, LessonRing>;
};

export const LessonList = ({
  courseSlug,
  moduleSlug,
  lessons,
  activeLessonSlug,
  lessonPercents,
  lessonLocks,
  lessonRings,
}: LessonListProps) => (
  <ul className="flex flex-col gap-sidebar-row-gap py-sidebar-row-block">
    {lessons.map((lesson, index) => (
      <li key={lesson.slug}>
        <LessonLink
          courseSlug={courseSlug}
          moduleSlug={moduleSlug}
          lesson={lesson}
          rank={index + 1}
          isActive={lesson.slug === activeLessonSlug}
          progressPercent={lessonPercents[lesson.slug] ?? 0}
          ring={lessonRings?.[lesson.slug]}
          lock={lessonLocks[lesson.slug]}
        />
      </li>
    ))}
  </ul>
);
