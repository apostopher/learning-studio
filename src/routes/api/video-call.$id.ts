import { createFileRoute } from '@tanstack/react-router';
import { getCallForUser } from '#/db/video-calls';
import { auth } from '#/lib/auth';
import { reconcileVideoCall } from '#/lib/video-call-reconcile.server';
import { toStatusResponse } from '#/lib/video-call-service.server';

/** Polled by the client after hang-up until the transcript is saved; each
 * poll reconciles with Tavus, so the transcript arrives even if the webhook
 * never does. */
export async function getVideoCallHandler(
  request: Request,
  id: string,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const call = await getCallForUser(id, session.user.id);
  if (!call) return new Response('Not found', { status: 404 });

  const latest = call.transcriptSavedAt
    ? call
    : await reconcileVideoCall(call).catch((err) => {
        console.error('video call reconcile failed', err);
        return call;
      });
  return Response.json(toStatusResponse(latest));
}

export const Route = createFileRoute('/api/video-call/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) => getVideoCallHandler(request, params.id),
    },
  },
});
