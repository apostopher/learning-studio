import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { createModule } from '#/db/admin';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { createModuleInputSchema } from '#/lib/admin-schemas';
import { requireCoursePermission } from '#/lib/permissions.server';

async function guard(
  request: Request,
  courseId: number,
): Promise<Response | null> {
  try {
    await requireCoursePermission(
      request.headers,
      courseId,
      'structure',
      'create',
    );
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

export async function postModuleHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  const denied = await guard(request, courseId);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createModuleInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return Response.json(
    await createModule({
      courseId,
      name: parsed.data.name,
      imageUrlAvif: parsed.data.imageUrlAvif ?? null,
      imageUrlWebp: parsed.data.imageUrlWebp ?? null,
    }),
  );
}

export const Route = createFileRoute('/api/admin/courses/$courseId/modules')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        postModuleHandler(request, params.courseId),
    },
  },
});
