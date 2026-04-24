import { LessonLink } from './lesson-link';

type LessonLike = { slug: string; name: string };

type LessonListProps = {
  moduleSlug: string;
  lessons: readonly LessonLike[];
  activeLessonSlug: string | null;
};

export const LessonList = ({
  moduleSlug,
  lessons,
  activeLessonSlug,
}: LessonListProps) => (
  <ul className="flex flex-col gap-sidebar-row-gap py-sidebar-row-block">
    {lessons.map((lesson, index) => (
      <li key={lesson.slug}>
        <LessonLink
          moduleSlug={moduleSlug}
          lesson={lesson}
          rank={index + 1}
          isActive={lesson.slug === activeLessonSlug}
        />
      </li>
    ))}
  </ul>
);
