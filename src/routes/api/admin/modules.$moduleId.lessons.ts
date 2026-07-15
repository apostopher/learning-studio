import { createFileRoute } from '@tanstack/react-router';
import { createLesson } from '@/db/admin';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';
import { createLessonInputSchema } from '@/lib/admin-schemas';

export const Route = createFileRoute('/api/admin/modules/$moduleId/lessons')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          await requireAdmin(request.headers);
        } catch (error) {
          if (error instanceof ForbiddenError) {
            return new Response('Forbidden', { status: 403 });
          }
          throw error;
        }
        const moduleId = Number(params.moduleId);
        if (!Number.isInteger(moduleId) || moduleId <= 0) {
          return Response.json({ error: 'Invalid module id' }, { status: 400 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        const parsed = createLessonInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.flatten() },
            { status: 400 },
          );
        }
        return Response.json(
          await createLesson({ moduleId, name: parsed.data.name }),
        );
      },
    },
  },
});
