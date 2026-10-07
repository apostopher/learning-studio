import { createFileRoute } from '@tanstack/react-router';
import { env } from '#/env';
import { auth } from '#/lib/auth';
import {
  loadAllowance,
  toAllowanceResponse,
} from '#/lib/video-call-service.server';

/** Drives the video button's locked state. The start route re-checks
 * everything, so a stale answer here can never let a call through. */
export async function getAllowanceHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { allowance, activeCall } = await loadAllowance(
    session.user.id,
    new Date(),
  );
  return Response.json(
    toAllowanceResponse({
      allowance,
      activeCall,
      configured: Boolean(env.TAVUS_PERSONA_ID),
    }),
  );
}

export const Route = createFileRoute('/api/video-call/allowance')({
  server: { handlers: { GET: ({ request }) => getAllowanceHandler(request) } },
});
