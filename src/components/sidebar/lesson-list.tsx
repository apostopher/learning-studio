import { LessonLink } from './lesson-link';

type LessonLike = { slug: string; name: string; videoId: string | null };

type LessonListProps = {
  moduleSlug: string;
  lessons: readonly LessonLike[];
  activeLessonSlug: string | null;
  lessonPercents: Record<string, number>;
};

export const LessonList = ({
  moduleSlug,
  lessons,
  activeLessonSlug,
  lessonPercents,
}: LessonListProps) => (
  <ul className="flex flex-col gap-sidebar-row-gap py-sidebar-row-block">
    {lessons.map((lesson, index) => (
      <li key={lesson.slug}>
        <LessonLink
          moduleSlug={moduleSlug}
          lesson={lesson}
          rank={index + 1}
          isActive={lesson.slug === activeLessonSlug}
          progressPercent={
            (lesson.videoId && lessonPercents[lesson.videoId]) || 0
          }
        />
      </li>
    ))}
  </ul>
);
