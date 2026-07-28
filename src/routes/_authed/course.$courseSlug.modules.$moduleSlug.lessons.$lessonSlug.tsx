import { createFileRoute } from '@tanstack/react-router';
import { LessonMainWrapper } from '../../components/lesson-main';

export const Route = createFileRoute(
  '/_authed/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug',
)({
  component: LessonRoute,
});

function LessonRoute() {
  const { courseSlug, moduleSlug, lessonSlug } = Route.useParams();
  return (
    <LessonMainWrapper
      courseSlug={courseSlug}
      moduleSlug={moduleSlug}
      lessonSlug={lessonSlug}
    />
  );
}
