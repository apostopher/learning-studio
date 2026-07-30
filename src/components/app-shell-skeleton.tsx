import { LessonSkeleton } from './lesson-main/parts/lesson-skeleton';
import { SidebarSkeleton } from './sidebar/sidebar-skeleton';
import { AppShell } from './app-shell';
import { AppShellFooter } from './app-shell-footer';

/**
 * What the learner sees while a course route's `beforeLoad` guards resolve.
 *
 * Deliberately the real `AppShell` with skeleton contents rather than a
 * bespoke loading screen: identical grid geometry means the swap to real
 * content shifts nothing. Wired as `pendingComponent` on the course routes,
 * not as `defaultPendingComponent`, because this shell is wrong for /admin
 * and /auth.
 */
export const AppShellSkeleton = () => (
  <AppShell
    aside={<SidebarSkeleton />}
    main={
      <>
        <p className="sr-only" role="status">
          Loading course
        </p>
        <LessonSkeleton />
      </>
    }
    footer={<AppShellFooter />}
  />
);
