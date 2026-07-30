import { AppShell } from './app-shell';
import { AppShellFooter } from './app-shell-footer';
import { LessonSkeleton } from './lesson-main/parts/lesson-skeleton';
import { SidebarSkeleton } from './sidebar/sidebar-skeleton';

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
        <output className="sr-only">Loading course</output>
        <LessonSkeleton />
      </>
    }
    footer={<AppShellFooter />}
  />
);
