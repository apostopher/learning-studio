import { createFileRoute } from '@tanstack/react-router';
import { AdminCoursesPageContainer } from '@/components/admin/admin-courses-page-container';

export const Route = createFileRoute('/_authed/admin/')({
  component: AdminCoursesPageContainer,
});
