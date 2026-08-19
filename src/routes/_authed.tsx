import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { CourseLevelBannerContainer } from '../components/course-level-banner-container';
import { alertBarColor } from '../styles/theme.generated';

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: '/auth/login',
        search: { redirect: location.href },
      });
    }
  },
  // The env gate lives here rather than inside AlertBar so the component stays
  // a pure presentational unit. Mounting here covers every authed route —
  // course, lesson, admin, app — including any added later, and keeps the bar
  // off the login and landing pages.
  //
  // CourseLevelBannerContainer, not a bare AlertBar: it IS an AlertBar (see
  // its own doc comment) but feeds it the between-visits level-change notice
  // when the current route is a course and one is pending — AlertBar already
  // rendered `children` and nothing was mounting any.
  component: () => (
    <>
      {alertBarColor !== null && <CourseLevelBannerContainer />}
      <Outlet />
    </>
  ),
});
