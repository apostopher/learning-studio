import { createFileRoute } from '@tanstack/react-router';
import { listCourseProviders, saveCourseProvider } from '@/db/admin';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';
import { saveCredentialInputSchema } from '@/lib/admin-schemas';

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
  '/api/admin/courses/$courseId/credentials',
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = await guard(request);
        if (denied) return denied;
        const courseId = parseCourseId(params.courseId);
        if (courseId === null) {
          return Response.json({ error: 'Invalid course id' }, { status: 400 });
        }
        return Response.json(await listCourseProviders(courseId));
      },

      PUT: async ({ request, params }) => {
        const denied = await guard(request);
        if (denied) return denied;
        const courseId = parseCourseId(params.courseId);
        if (courseId === null) {
          return Response.json({ error: 'Invalid course id' }, { status: 400 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const parsed = saveCredentialInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: 'Invalid credential fields' },
            { status: 400 },
          );
        }

        const result = await saveCourseProvider(courseId, parsed.data);
        if (!result.ok) {
          return Response.json(
            { error: result.error ?? 'Validation failed' },
            { status: 400 },
          );
        }
        return Response.json({ ok: true });
      },
    },
  },
});
