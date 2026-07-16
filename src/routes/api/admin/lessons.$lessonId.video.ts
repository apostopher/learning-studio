import { createFileRoute } from '@tanstack/react-router';
import { setLessonVideo } from '@/db/admin';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';
import { setLessonVideoInputSchema } from '@/lib/admin-schemas';

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

export const Route = createFileRoute('/api/admin/lessons/$lessonId/video')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        const denied = await guard(request);
        if (denied) return denied;
        const lessonId = parseLessonId(params.lessonId);
        if (lessonId === null) {
          return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const parsed = setLessonVideoInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.flatten() },
            { status: 400 },
          );
        }

        const updated = await setLessonVideo(
          lessonId,
          parsed.data.provider,
          parsed.data.ref,
        );
        if (!updated) return new Response('Not found', { status: 404 });
        return Response.json({ ok: true });
      },
    },
  },
});
