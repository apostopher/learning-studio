import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '../components/app-shell';
import { CourseSidebarWrapper } from '../components/sidebar/course-sidebar-wrapper';
import { appTitle } from '../styles/theme.generated';

export const Route = createFileRoute(
  '/modules/$moduleSlug/lessons/$lessonSlug',
)({
  component: LessonRoute,
});

export type LessonPlaceholderProps = {
  moduleSlug: string;
  lessonSlug: string;
};

export const LessonPlaceholder = ({
  moduleSlug,
  lessonSlug,
}: LessonPlaceholderProps) => (
  <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-12">
    <p>
      Module: <strong>{moduleSlug}</strong>
    </p>
    <p>
      Lesson: <strong>{lessonSlug}</strong>
    </p>
  </div>
);

function LessonRoute() {
  const { moduleSlug, lessonSlug } = Route.useParams();
  return (
    <AppShell
      header={<div className="flex items-center gap-3 h-full ps-4 pe-4" />}
      aside={<CourseSidebarWrapper />}
      main={
        <LessonPlaceholder moduleSlug={moduleSlug} lessonSlug={lessonSlug} />
      }
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-gray-11 text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
