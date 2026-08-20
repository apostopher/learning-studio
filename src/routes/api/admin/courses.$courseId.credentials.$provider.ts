import { createFileRoute } from '@tanstack/react-router';
import { deleteCourseProvider } from '@/db/admin';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';
import { providerIdSchema } from '@/lib/admin-schemas';

// Deliberately NOT converted to `requireCoursePermission`: these are
// video-provider *secrets*. Course-scoped, but a professor authoring lessons
// on this course has no business reading deployment credentials.
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

function parseCourseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/credentials/$provider',
)({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const denied = await guard(request);
        if (denied) return denied;
        const courseId = parseCourseId(params.courseId);
        if (courseId === null) {
          return Response.json({ error: 'Invalid course id' }, { status: 400 });
        }
        const parsedProvider = providerIdSchema.safeParse(params.provider);
        if (!parsedProvider.success) {
          return Response.json({ error: 'Invalid provider' }, { status: 400 });
        }

        const deleted = await deleteCourseProvider(
          courseId,
          parsedProvider.data,
        );
        if (!deleted) return new Response('Not found', { status: 404 });
        return new Response(null, { status: 204 });
      },
    },
  },
});
