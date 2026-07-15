import { createFileRoute } from '@tanstack/react-router';
import { createCourse, listAdminCourses } from '@/db/admin';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';
import { createCourseInputSchema } from '@/lib/admin-schemas';

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

export const Route = createFileRoute('/api/admin/courses')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await guard(request);
        if (denied) return denied;
        return Response.json(await listAdminCourses());
      },
      POST: async ({ request }) => {
        const denied = await guard(request);
        if (denied) return denied;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        const parsed = createCourseInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.flatten() },
            { status: 400 },
          );
        }
        return Response.json(await createCourse(parsed.data));
      },
    },
  },
});
