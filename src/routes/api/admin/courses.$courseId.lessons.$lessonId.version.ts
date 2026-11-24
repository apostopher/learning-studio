import { createFileRoute } from '@tanstack/react-router';
import { waitUntil } from '@vercel/functions';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { coursesAreInOrg } from '#/db/course-remixes';
import { updateCourseLessonVersion } from '#/db/lesson-versions';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { updateCourseLessonVersionInputSchema } from '#/lib/admin-schemas';
import { indexLessonVersions } from '#/lib/index-lesson-versions.server';
import { requireCoursePermission } from '#/lib/permissions.server';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const notFound = () =>
  Response.json({ error: 'Lesson not found' }, { status: 404 });

/**
 * Move one course to the lesson's current version.
 *
 * Guarded on the course being VIEWED, not the owner of the module the lesson
 * sits in: a pin is the viewing course's own, and no other course changes.
 */
export async function postCourseLessonVersionHandler(
  request: Request,
  courseIdRaw: string,
  lessonIdRaw: string,
): Promise<Response> {
  const courseId = parseId(courseIdRaw);
  const lessonId = parseId(lessonIdRaw);
  if (courseId === null || lessonId === null) return notFound();
  try {
    await requireCoursePermission(
      request.headers,
      courseId,
      'structure',
      'update',
    );
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
  // An admin passes that guard on any course, another organisation's included.
  if (!(await coursesAreInOrg(getActiveOrgId(), [courseId]))) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = updateCourseLessonVersionInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await updateCourseLessonVersion({
    courseId,
    lessonId,
    toVersion: parsed.data.toVersion,
  });
  if (result.ok) {
    waitUntil(indexLessonVersions(result.createdVersionIds));
    return Response.json({ version: result.version });
  }
  if (result.reason === 'not-found') return notFound();
  return Response.json(
    {
      error:
        result.reason === 'stale'
          ? 'Disciplines has changed since you opened this. Try again.'
          : 'This course already has this version.',
      code: result.reason,
    },
    { status: 409 },
  );
}

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/lessons/$lessonId/version',
)({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        postCourseLessonVersionHandler(
          request,
          params.courseId,
          params.lessonId,
        ),
    },
  },
});
