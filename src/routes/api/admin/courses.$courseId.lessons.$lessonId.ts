import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { setLessonVisibility } from '#/db/lesson-visibility';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { setLessonVisibilityInputSchema } from '#/lib/admin-schemas';
import { requireCoursePermission } from '#/lib/permissions.server';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Show or hide a lesson in one course. The course's `structure`, like placing
 * the lesson there: it is not the lesson that changes, so its discipline has no
 * say and needs none.
 */
export async function patchCourseLessonHandler(
  request: Request,
  courseIdRaw: string,
  lessonIdRaw: string,
): Promise<Response> {
  const courseId = parseId(courseIdRaw);
  const lessonId = parseId(lessonIdRaw);
  if (courseId === null || lessonId === null) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = setLessonVisibilityInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { isVisible } = parsed.data;
  const set = await setLessonVisibility({ courseId, lessonId, isVisible });
  if (!set) return new Response('Not found', { status: 404 });
  return Response.json({ isVisible });
}

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/lessons/$lessonId',
)({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        patchCourseLessonHandler(request, params.courseId, params.lessonId),
    },
  },
});
