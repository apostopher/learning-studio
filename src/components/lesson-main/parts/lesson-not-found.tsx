import { SearchX } from 'lucide-react';

type LessonNotFoundProps = {
  lessonSlug: string;
};

export const LessonNotFound = ({ lessonSlug }: LessonNotFoundProps) => (
  <div className="lesson-card" role="status">
    <SearchX
      size={32}
      aria-hidden="true"
      style={{ color: 'var(--color-gray-9)' }}
    />
    <h2 className="lesson-card__heading">Lesson not found</h2>
    <p>
      We couldn't find a lesson matching <code>{lessonSlug}</code> in this
      course.
    </p>
  </div>
);
