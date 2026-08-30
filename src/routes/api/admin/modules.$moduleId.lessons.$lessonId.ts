import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { getCourseIdForModuleId } from '#/db/lesson-access';
import { movePlacement, unlinkLesson } from '#/db/placements';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { moveLessonInputSchema } from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireCoursePermission,
} from '#/lib/permissions.server';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Guards both handlers below against the course derived from `moduleId` in
 * the URL — a placement is addressed by (module, lesson), and the course a
 * caller must hold `structure` authority on is the one that module belongs
 * to, never the lesson's (a lesson can be taught by many courses now).
 */
async function guard(
  request: Request,
  courseId: number,
  action: 'update' | 'delete',
): Promise<Response | null> {
  try {
    await requireCoursePermission(
      request.headers,
      courseId,
      'structure',
      action,
    );
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

export async function deletePlacementHandler(
  request: Request,
  moduleIdRaw: string,
  lessonIdRaw: string,
): Promise<Response> {
  const moduleId = parseId(moduleIdRaw);
  const lessonId = parseId(lessonIdRaw);
  if (moduleId === null || lessonId === null) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }
  // Resolve the course before guarding: guarding on a null course id would
  // misreport "no such module" as "forbidden". The 404 is then answered only
  // to someone on the teaching side — see `absentResourceResponse`, which
  // closes the id-enumeration oracle this ordering would otherwise open.
  const courseId = await getCourseIdForModuleId(moduleId);
  if (courseId === null) {
    return absentResourceResponse(request.headers, 'Module not found');
  }
  const denied = await guard(request, courseId, 'delete');
  if (denied) return denied;

  // Unlinks the placement only — the lesson itself survives in the library
  // and any other course teaching it. Never `deleteLesson`, which is a
  // discipline-scoped, content-destroying operation this route has no
  // authority over.
  const unlinked = await unlinkLesson(moduleId, lessonId);
  if (!unlinked) return new Response('Not found', { status: 404 });
  return new Response(null, { status: 204 });
}

export async function patchPlacementHandler(
  request: Request,
  moduleIdRaw: string,
  lessonIdRaw: string,
): Promise<Response> {
  const moduleId = parseId(moduleIdRaw);
  const lessonId = parseId(lessonIdRaw);
  if (moduleId === null || lessonId === null) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }
  const courseId = await getCourseIdForModuleId(moduleId);
  if (courseId === null) {
    return absentResourceResponse(request.headers, 'Module not found');
  }
  const denied = await guard(request, courseId, 'update');
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = moveLessonInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const moved = await movePlacement({
    lessonId,
    targetModuleId: parsed.data.targetModuleId,
    prevLessonId: parsed.data.prevLessonId,
    nextLessonId: parsed.data.nextLessonId,
  });
  // `movePlacement` answers null both for a dangling target module and for a
  // target module that resolves to a DIFFERENT course than `moduleId` above
  // (its own scoping refuses to move a placement out of its course) — both
  // are "this request has no placement to act on" from here, and the caller
  // already cleared this course's `structure:update`, so a plain 404 is
  // right rather than the enumeration-safe `absentResourceResponse`.
  if (!moved) return new Response('Not found', { status: 404 });
  return Response.json(moved);
}

export const Route = createFileRoute(
  '/api/admin/modules/$moduleId/lessons/$lessonId',
)({
  server: {
    handlers: {
      DELETE: ({ request, params }) =>
        deletePlacementHandler(request, params.moduleId, params.lessonId),
      PATCH: ({ request, params }) =>
        patchPlacementHandler(request, params.moduleId, params.lessonId),
    },
  },
});
