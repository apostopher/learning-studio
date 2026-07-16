import { createFileRoute } from '@tanstack/react-router';
import { resolveLessonPlayback } from '@/db/admin';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';

/** Admin guard — returns a 403 Response to short-circuit, or null to proceed. */
async function guard(request: Request): Promise<Response | null> {
  try {
    await requireAdmin(request.headers);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

function parseLessonId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const Route = createFileRoute(
  '/api/admin/lessons/$lessonId/video-playback',
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = await guard(request);
        if (denied) return denied;
        const lessonId = parseLessonId(params.lessonId);
        if (lessonId === null) {
          return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
        }
        const playback = await resolveLessonPlayback(lessonId);
        if (!playback) return new Response('Not found', { status: 404 });
        return Response.json(playback);
      },
    },
  },
});
