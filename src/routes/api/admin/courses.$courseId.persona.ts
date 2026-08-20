import { createFileRoute } from '@tanstack/react-router';
import { getCoursePersonaSelection, setCoursePersona } from '#/db/course-orgs';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { personaSelectionInputSchema } from '#/lib/admin-schemas';

// Deliberately NOT converted to `requireCoursePermission`: this pins an
// org-level AI persona to a course. The persona itself is org config, not
// this course's content, so it stays behind the org-wide admin guard.
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

/** Which persona this course is pinned to for the active org, if any. */
export async function getCoursePersonaHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }

  return Response.json(
    await getCoursePersonaSelection(courseId, getActiveOrgId()),
  );
}

/**
 * Pin this course to a persona, or clear the pin with `null` so it follows the
 * org default again.
 *
 * A 404 here means the course is not a member of the active org — joining one
 * is not something picking a persona should do as a side effect, so this
 * updates an existing membership rather than upserting one.
 */
export async function putCoursePersonaHandler(
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

  const parsed = personaSelectionInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await setCoursePersona(
    courseId,
    getActiveOrgId(),
    parsed.data.personaId,
  );
  if (!result.ok) {
    if (result.reason === 'unpublished') {
      return Response.json(
        { error: 'Publish this persona before assigning it to a course' },
        { status: 409 },
      );
    }
    return Response.json(
      {
        error:
          result.reason === 'not-linked'
            ? 'This course is not part of the active organisation'
            : 'Persona not found',
      },
      { status: 404 },
    );
  }
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/courses/$courseId/persona')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getCoursePersonaHandler(request, params.courseId),
      PUT: ({ request, params }) =>
        putCoursePersonaHandler(request, params.courseId),
    },
  },
});
