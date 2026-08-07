import { createFileRoute } from '@tanstack/react-router';
import { AppHeaderContainer } from '../../components/app-header-container';
import { MyCoursesPageContainer } from '../../components/courses/my-courses-page-container';

export const Route = createFileRoute('/_authed/app')({
  component: AppPage,
});

function AppPage() {
  return (
    <>
      <AppHeaderContainer />
      <MyCoursesPageContainer />
    </>
  );
}
