import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { remixCourse } from '#/db/course-remixes';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { remixCourseInputSchema } from '#/lib/admin-schemas';
import {
  type CourseActor,
  requireCoursePermission,
} from '#/lib/permissions.server';

function parseCourseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Remix `sourceCourseId` into `courseId`.
 *
 * Two guards, both required (spec, Permissions row 4): `structure:update` on
 * the REMIXER — it is that rail being reshaped — and `structure:read` on the
 * SOURCE, because placing someone's modules on your syllabus needs at least
 * the standing to see them. The same rule the knowledge library applies to
 * placing another discipline's lesson. Remixer first, so a caller with no
 * rights on their own course learns nothing about the source's existence.
 *
 * A course remixing itself is a 400 on the body's shape, answered before
 * either guard: both ids are the caller's own, so nothing is disclosed.
 */
export async function postRemixHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
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
  const parsed = remixCourseInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { sourceCourseId } = parsed.data;
  if (sourceCourseId === courseId) {
    return Response.json(
      { error: 'A course cannot remix itself' },
      { status: 400 },
    );
  }

  let actor: CourseActor;
  try {
    actor = await requireCoursePermission(
      request.headers,
      courseId,
      'structure',
      'update',
    );
    await requireCoursePermission(
      request.headers,
      sourceCourseId,
      'structure',
      'read',
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }

  const result = await remixCourse({
    orgId: getActiveOrgId(),
    courseId,
    sourceCourseId,
    actorId: actor.userId,
  });
  if (result.ok) {
    return Response.json({ moduleCount: result.moduleCount }, { status: 201 });
  }
  if (result.reason === 'already-remixed') {
    return Response.json(
      { error: 'This course already remixes that one' },
      { status: 409 },
    );
  }
  if (result.reason === 'source-depends-on-borrowed') {
    // The one-hop rule (see `remixCourse`): a gate on a module the source
    // only borrows would name nothing here and fail open. The sentence is
    // what the remix button's toast shows, so it names the source, the
    // modules, and both remedies; the slugs travel for a client that wants
    // to link to them.
    const names = result.modules.map((m) => m.name).join(', ');
    const plural = result.modules.length > 1;
    return Response.json(
      {
        error: `${result.sourceName} cannot be remixed yet: its ${plural ? 'modules' : 'module'} ${names} ${plural ? 'depend' : 'depends'} on modules it borrows, which would not travel. Un-remix those in ${result.sourceName} first, or remove the dependency.`,
        slugs: result.modules.map((m) => m.slug),
      },
      { status: 409 },
    );
  }
  if (result.reason === 'self') {
    return Response.json(
      { error: 'A course cannot remix itself' },
      { status: 400 },
    );
  }
  return Response.json({ error: 'Course not found' }, { status: 404 });
}

export const Route = createFileRoute('/api/admin/courses/$courseId/remixes')({
  server: {
    handlers: {
      POST: ({ request, params }) => postRemixHandler(request, params.courseId),
    },
  },
});
