import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { AuthFlowContainer } from '../../components/auth/auth-flow-container';

export const Route = createFileRoute('/auth/login')({
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.session) {
      throw redirect({ to: search.redirect ?? '/app' });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch();
  return <AuthFlowContainer redirect={redirectTo} />;
}
