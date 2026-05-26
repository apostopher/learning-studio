import type { LessonMaterial } from "#/db/lesson";

type DebriefQuizContainerProps = {
  lessonSlug: string;
  material: NonNullable<LessonMaterial>;
};

export const DebriefQuizContainer = ({
  lessonSlug: _lessonSlug,
  material: _material,
}: DebriefQuizContainerProps) => (
  <p className="text-sm text-gray-11">Loading debrief...</p>
);
