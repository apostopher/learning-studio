import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '../components/app-shell';
import { LessonEmpty } from '../components/lesson-main';
import { CourseSidebarWrapper } from '../components/sidebar/course-sidebar-wrapper';
import { appTitle } from '../styles/theme.generated';

export const Route = createFileRoute('/')({ component: App });

function App() {
  return (
    <AppShell
      aside={<CourseSidebarWrapper />}
      main={<LessonEmpty />}
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-gray-11 text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
