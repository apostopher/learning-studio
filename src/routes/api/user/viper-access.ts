import { createFileRoute } from '@tanstack/react-router';
import { hasViperAccess } from '#/db/viper-access';
import { auth } from '#/lib/auth';

/** Whether the signed-in user may use Viper — see `hasViperAccess`. */
export async function getViperAccessHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });
  return Response.json({ allowed: await hasViperAccess(session.user.id) });
}

export const Route = createFileRoute('/api/user/viper-access')({
  server: {
    handlers: { GET: ({ request }) => getViperAccessHandler(request) },
  },
});
