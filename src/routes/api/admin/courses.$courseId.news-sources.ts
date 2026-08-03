import { createFileRoute } from '@tanstack/react-router';
import { createNewsSource, listCourseNewsSources } from '#/db/news-sources';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { createNewsSourceInputSchema } from '#/lib/admin-schemas';

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

export async function getNewsSourcesHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  return Response.json(await listCourseNewsSources(courseId));
}

export async function postNewsSourceHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createNewsSourceInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createNewsSource(courseId, parsed.data);
  if (!result.ok) {
    // 409 + a field name, so the form can attach the message to the URL input
    // rather than firing a toast that leaves the offending field unmarked.
    return Response.json(
      {
        error: 'This course already has a source with this URL',
        field: 'url',
      },
      { status: 409 },
    );
  }
  return Response.json(result.source, { status: 201 });
}

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/news-sources',
)({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getNewsSourcesHandler(request, params.courseId),
      POST: ({ request, params }) =>
        postNewsSourceHandler(request, params.courseId),
    },
  },
});
