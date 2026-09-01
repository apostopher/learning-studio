import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { createLesson } from '#/db/admin';
import { getCourseIdForModuleId } from '#/db/lesson-access';
import { linkLesson } from '#/db/placements';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { addModuleLessonInputSchema } from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireCoursePermission,
} from '#/lib/permissions.server';

function parseModuleId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function postLessonHandler(
  request: Request,
  moduleIdRaw: string,
): Promise<Response> {
  const moduleId = parseModuleId(moduleIdRaw);
  if (moduleId === null) {
    return Response.json({ error: 'Invalid module id' }, { status: 400 });
  }
  // Resolve the course before guarding: guarding on a null course id would
  // misreport "no such module" as "forbidden". The 404 is then answered only
  // to someone on the teaching side — see `absentResourceResponse`, which
  // closes the id-enumeration oracle this ordering would otherwise open.
  const courseId = await getCourseIdForModuleId(moduleId);
  if (courseId === null) {
    return absentResourceResponse(request.headers, 'Module not found');
  }
  try {
    await requireCoursePermission(
      request.headers,
      courseId,
      'structure',
      'create',
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
  const parsed = addModuleLessonInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // `lessonId` means "link this existing library lesson into the module";
  // `name` means "author a brand new one". The two must never both run —
  // one request does exactly one of these things.
  if ('lessonId' in parsed.data) {
    const result = await linkLesson({
      moduleId,
      lessonId: parsed.data.lessonId,
      // Appended to the end of the module rather than threaded through a
      // position from the client: the library picker that calls this has no
      // neighbor to place the lesson between.
      prevLessonId: null,
      nextLessonId: null,
    });
    if (result === null) {
      // A dangling module id slipping through between the resolve above and
      // this call (e.g. a concurrent delete) is a 404, not a lie dressed up
      // as "already in this course".
      return absentResourceResponse(request.headers, 'Module not found');
    }
    if (result === 'duplicate') {
      return Response.json(
        { error: 'This course already teaches this lesson' },
        { status: 409 },
      );
    }
    return Response.json(result);
  }

  return Response.json(
    await createLesson({ moduleId, name: parsed.data.name }),
  );
}

export const Route = createFileRoute('/api/admin/modules/$moduleId/lessons')({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        postLessonHandler(request, params.moduleId),
    },
  },
});
