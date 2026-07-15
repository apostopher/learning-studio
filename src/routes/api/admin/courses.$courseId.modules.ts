import { createFileRoute } from '@tanstack/react-router';
import { createModule } from '@/db/admin';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';
import { createModuleInputSchema } from '@/lib/admin-schemas';

export const Route = createFileRoute('/api/admin/courses/$courseId/modules')({
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
        const courseId = Number(params.courseId);
        if (!Number.isInteger(courseId) || courseId <= 0) {
          return Response.json({ error: 'Invalid course id' }, { status: 400 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        const parsed = createModuleInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.flatten() },
            { status: 400 },
          );
        }
        return Response.json(
          await createModule({
            courseId,
            name: parsed.data.name,
            imageUrlAvif: parsed.data.imageUrlAvif ?? null,
            imageUrlWebp: parsed.data.imageUrlWebp ?? null,
          }),
        );
      },
    },
  },
});
