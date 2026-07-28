import {
  createFileRoute,
  Outlet,
  redirect,
  useParams,
} from '@tanstack/react-router';
import { getMySubscribedSlugs } from '@/lib/course-functions';
import { AppShell } from '../../components/app-shell';
import { LessonHeaderWrapper } from '../../components/lesson-main';
import { CourseSidebarWrapper } from '../../components/sidebar/course-sidebar-wrapper';
import { appTitle } from '../../styles/theme.generated';

export const Route = createFileRoute('/_authed/course/$courseSlug')({
  beforeLoad: async ({ params }) => {
    const slugs = await getMySubscribedSlugs();
    if (!slugs.includes(params.courseSlug)) {
      // Redirect (not notFound()) for three reasons:
      // 1. `admin.tsx` already establishes redirect-to-`/app` as this
      //    codebase's "you may not view this" behaviour — follow it rather
      //    than introducing a second idiom.
      // 2. There is no `notFoundComponent` anywhere in this repo, so
      //    `notFound()` would render an unstyled framework default.
      // 3. Redirecting *both* the bogus-slug and the not-enrolled case to
      //    the same place avoids leaking which slugs are real courses.
      //    Distinguishing them would let someone enumerate the catalogue.
      throw redirect({ to: '/app' });
    }
  },
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
  //
  // headerMain is rendered here (rather than by the lesson leaf itself)
  // because AppShell places it in a fixed grid row while `main` sits inside
  // a ScrollArea — a header rendered by the leaf would scroll away with the
  // lesson body instead of staying pinned.
  const { moduleSlug, lessonSlug } = useParams({ strict: false }) as {
    moduleSlug?: string;
    lessonSlug?: string;
  };

  return (
    <AppShell
      headerMain={
        moduleSlug != null && lessonSlug != null ? (
          <LessonHeaderWrapper
            courseSlug={courseSlug}
            moduleSlug={moduleSlug}
            lessonSlug={lessonSlug}
          />
        ) : undefined
      }
      aside={<CourseSidebarWrapper courseSlug={courseSlug} />}
      main={<Outlet />}
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-secondary text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
