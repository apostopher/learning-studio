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
 * Shared `structure` permission check. DELETE guards the course derived from
 * the URL's `moduleId` (the placement being removed lives there, full stop).
 * PATCH guards the DESTINATION course instead — see `patchPlacementHandler`
 * for why guarding on the URL module alone is not enough there.
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
  // Resolved for the 404 (a bad URL module answers before the body is even
  // read) AND to check the destination against below — NOT guarded on yet.
  // `movePlacement` writes whichever course `targetModuleId` (from the body)
  // resolves to; guarding on this course alone would authorize a write to a
  // course chosen entirely by the client. See the mismatch check below.
  const courseId = await getCourseIdForModuleId(moduleId);
  if (courseId === null) {
    return absentResourceResponse(request.headers, 'Module not found');
  }

  // Guarded BEFORE the body is read. With the parse first, an unauthenticated
  // caller got a 400 for a module that exists and a 403 for one that does not
  // — walking the integer space reads off which module ids are real, which is
  // the id oracle `absentResourceResponse` exists to close. The DELETE handler
  // above has always been ordered this way; this one drifted.
  //
  // The SOURCE module's course is the right thing to guard here: it is the one
  // established by the id in the URL. Authority over the DESTINATION is
  // checked separately below, once the body names it.
  const deniedSource = await guard(request, courseId, 'update');
  if (deniedSource) return deniedSource;

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

  // Guard the DESTINATION, not the URL module. `movePlacement` below scopes
  // its UPDATE to the modules of whatever course `targetModuleId` resolves
  // to — chosen entirely by the request body. Guarding on `courseId` (the
  // URL's course) and stopping there, as this route used to, would let staff
  // on course A relocate course B's placement by pointing `targetModuleId`
  // at one of B's modules: the guard checks A, the write lands in B. This is
  // the same hazard already fixed on the sibling `move` branch in
  // `lessons.$lessonId.ts` — read its doc comment, it states the identical
  // reasoning. Requiring the target to resolve to the SAME course as the URL
  // makes `moduleId` load-bearing rather than decorative, and folds "target
  // is in a different course" into the enumeration-safe
  // `absentResourceResponse` rather than a 403 — telling a caller "that
  // module is in a course you can't see" would itself be a disclosure.
  const targetCourseId = await getCourseIdForModuleId(
    parsed.data.targetModuleId,
  );
  if (targetCourseId === null || targetCourseId !== courseId) {
    return absentResourceResponse(request.headers, 'Target module not found');
  }
  const denied = await guard(request, targetCourseId, 'update');
  if (denied) return denied;

  const moved = await movePlacement({
    lessonId,
    targetModuleId: parsed.data.targetModuleId,
    prevLessonId: parsed.data.prevLessonId,
    nextLessonId: parsed.data.nextLessonId,
  });
  // Only reachable now for a placement that doesn't currently exist for this
  // lesson in this (now-confirmed-same) course — the cross-course case is
  // already refused above. A plain 404 is right: the caller already cleared
  // `structure:update` on this exact course.
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
