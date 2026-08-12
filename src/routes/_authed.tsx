import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AlertBar } from '../components/alert-bar';
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
  component: () => (
    <>
      {alertBarColor !== null && <AlertBar />}
      <Outlet />
    </>
  ),
});
