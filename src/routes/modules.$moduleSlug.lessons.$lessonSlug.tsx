import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '../components/app-shell';
import {
  LessonHeaderWrapper,
  LessonMainWrapper,
} from '../components/lesson-main';
import { CourseSidebarWrapper } from '../components/sidebar/course-sidebar-wrapper';
import { appTitle } from '../styles/theme.generated';

export const Route = createFileRoute(
  '/modules/$moduleSlug/lessons/$lessonSlug',
)({
  component: LessonRoute,
});

function LessonRoute() {
  const { moduleSlug, lessonSlug } = Route.useParams();
  return (
    <AppShell
      headerMain={
        <LessonHeaderWrapper
          moduleSlug={moduleSlug}
          lessonSlug={lessonSlug}
        />
      }
      aside={<CourseSidebarWrapper />}
      main={
        <LessonMainWrapper moduleSlug={moduleSlug} lessonSlug={lessonSlug} />
      }
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-gray-11 text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
