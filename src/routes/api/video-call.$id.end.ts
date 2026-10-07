import { createFileRoute } from '@tanstack/react-router';
import { getCallById, getCallForUser, markCallEnded } from '#/db/video-calls';
import { auth } from '#/lib/auth';
import { endConversation } from '#/lib/tavus.server';
import { clampDuration } from '#/lib/video-call-allowance';
import { reconcileVideoCall } from '#/lib/video-call-reconcile.server';
import { toStatusResponse } from '#/lib/video-call-service.server';

/** The learner hung up. Reconciles first so a call Tavus already ended (time
 * limit) keeps its real reason; otherwise ends it at Tavus and records
 * `user` with the real duration, giving unused minutes back. */
export async function endVideoCallHandler(
  request: Request,
  id: string,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const call = await getCallForUser(id, session.user.id);
  if (!call) return new Response('Not found', { status: 404 });

  const settled = await reconcileVideoCall(call).catch((err) => {
    console.error('video call reconcile failed', err);
    return call;
  });

  if (settled.status === 'active') {
    await endConversation(call.tavusConversationId).catch((err) =>
      console.error('tavus end conversation failed', err),
    );
    const now = new Date();
    await markCallEnded(call.id, {
      endedAt: now,
      durationSeconds: clampDuration(call.startedAt, now, call.reservedSeconds),
      endReason: 'user',
    });
  }

  return Response.json(
    toStatusResponse((await getCallById(call.id)) ?? settled),
  );
}

export const Route = createFileRoute('/api/video-call/$id/end')({
  server: {
    handlers: {
      POST: ({ request, params }) => endVideoCallHandler(request, params.id),
    },
  },
});
