import { createFileRoute, Outlet, useParams } from '@tanstack/react-router';
import { AppShell } from '../../components/app-shell';
import { LessonHeaderWrapper } from '../../components/lesson-main';
import { CourseSidebarWrapper } from '../../components/sidebar/course-sidebar-wrapper';
import { appTitle } from '../../styles/theme.generated';

export const Route = createFileRoute('/_authed/course/$courseSlug')({
  component: CourseLayout,
});

function CourseLayout() {
  const { courseSlug } = Route.useParams();
  // Loose read: these two params belong to the deeper lesson route, not this
  // layout's own path. Their presence is how the layout knows which leaf is
  // active — the same idiom CourseSidebarWrapper already uses for the same
  // two params. This only needs to distinguish two leaf shapes (course home
  // vs. a lesson); if a third leaf ever needs its own headerMain content,
  // revisit this rather than extending the presence check further.
  const lessonParams = useParams({ strict: false }) as {
    moduleSlug?: string;
    lessonSlug?: string;
  };
  const isLessonRoute =
    lessonParams.moduleSlug != null && lessonParams.lessonSlug != null;

  return (
    <AppShell
      headerMain={
        isLessonRoute ? (
          <LessonHeaderWrapper
            courseSlug={courseSlug}
            moduleSlug={lessonParams.moduleSlug as string}
            lessonSlug={lessonParams.lessonSlug as string}
          />
        ) : undefined
      }
      aside={<CourseSidebarWrapper />}
      main={<Outlet />}
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-secondary text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
