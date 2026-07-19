import { createFileRoute } from '@tanstack/react-router';
import {
  deleteLesson,
  moveLesson,
  updateLessonConfig,
  updateLessonName,
} from '@/db/admin';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';
import {
  moveLessonInputSchema,
  renameLessonInputSchema,
  updateLessonConfigInputSchema,
} from '@/lib/admin-schemas';

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

export const Route = createFileRoute('/api/admin/lessons/$lessonId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
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

        const rename = renameLessonInputSchema.safeParse(body);
        if (rename.success) {
          const updated = await updateLessonName(lessonId, rename.data.name);
          if (!updated) return new Response('Not found', { status: 404 });
          return Response.json(updated);
        }

        const move = moveLessonInputSchema.safeParse(body);
        if (move.success) {
          const updated = await moveLesson({
            lessonId,
            targetModuleId: move.data.targetModuleId,
            prevLessonId: move.data.prevLessonId,
            nextLessonId: move.data.nextLessonId,
          });
          if (!updated) return new Response('Not found', { status: 404 });
          return Response.json(updated);
        }

        const config = updateLessonConfigInputSchema.safeParse(body);
        if (config.success) {
          const updated = await updateLessonConfig(lessonId, config.data);
          if (!updated) return new Response('Not found', { status: 404 });
          return Response.json(updated);
        }

        return Response.json({ error: 'Invalid body' }, { status: 400 });
      },

      DELETE: async ({ request, params }) => {
        const denied = await guard(request);
        if (denied) return denied;
        const lessonId = parseLessonId(params.lessonId);
        if (lessonId === null) {
          return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
        }
        const deleted = await deleteLesson(lessonId);
        if (!deleted) return new Response('Not found', { status: 404 });
        return new Response(null, { status: 204 });
      },
    },
  },
});
