import { createFileRoute } from '@tanstack/react-router';
import { MyCoursesPageContainer } from '../../components/courses/my-courses-container';

export const Route = createFileRoute('/_authed/app')({
  component: MyCoursesPageContainer,
});
