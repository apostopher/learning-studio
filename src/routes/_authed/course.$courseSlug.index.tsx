import { createFileRoute } from '@tanstack/react-router';
import { LessonEmpty } from '../../components/lesson-main';

export const Route = createFileRoute('/_authed/course/$courseSlug/')({
  component: LessonEmpty,
});
