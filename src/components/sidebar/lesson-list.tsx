import type { LessonLock } from '#/lib/lesson-gating';
import { LessonLink } from './lesson-link';

type LessonLike = { slug: string; name: string; hasVideo: boolean };

type LessonListProps = {
  courseSlug: string;
  moduleSlug: string;
  lessons: readonly LessonLike[];
  activeLessonSlug: string | null;
  lessonPercents: Record<string, number>;
  lessonLocks: Record<string, LessonLock>;
};

export const LessonList = ({
  courseSlug,
  moduleSlug,
  lessons,
  activeLessonSlug,
  lessonPercents,
  lessonLocks,
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
          lock={lessonLocks[lesson.slug]}
        />
      </li>
    ))}
  </ul>
);
