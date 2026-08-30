import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import {
  deleteLesson,
  moveLesson,
  updateLessonConfig,
  updateLessonDependencies,
  updateLessonName,
} from '#/db/admin';
import {
  getCourseIdForLessonId,
  getCourseIdForModuleId,
  getDisciplineIdForLessonId,
} from '#/db/lesson-access';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  moveLessonInputSchema,
  renameLessonInputSchema,
  updateLessonConfigInputSchema,
  updateLessonDependenciesInputSchema,
} from '#/lib/admin-schemas';
import {
  absentResourceResponse,
  requireCoursePermission,
  requireLessonContentPermission,
} from '#/lib/permissions.server';

/**
 * Course-scoped guard for the branches that edit a single PLACEMENT rather
 * than the lesson itself: dependencies (a course's own prerequisite list) and
 * move (which course's module the lesson sits in, and where). Returns a 403
 * Response to short-circuit, or null to proceed.
 */
async function guardStructure(
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

/**
 * Guard for the branches that edit the LESSON itself — its name, its
 * config/gates, or deleting it outright. Authority follows the lesson's
 * DISCIPLINE, not any one course teaching it: once several courses can teach
 * the same lesson, no single course's staff is the authority over what the
 * lesson says or whether it exists at all, and a lesson has exactly one
 * discipline (or none). See `requireLessonContentPermission` for the
 * discipline/admin split this delegates to.
 */
async function guardContent(
  request: Request,
  disciplineId: number | null,
  action: 'update' | 'delete',
): Promise<Response | null> {
  try {
    await requireLessonContentPermission(request.headers, disciplineId, action);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

/**
 * Resolves the discipline `guardContent` needs to decide SME-vs-admin.
 *
 * Defensively re-checks existence rather than trusting the caller's earlier
 * `lessonExistsAt` check: that check runs once, before the body is even
 * parsed, and letting a not-found lookup here silently coerce to
 * `disciplineId: null` would misroute a lesson that vanished between the two
 * checks into the admin-only branch instead of a 404.
 */
async function resolveLessonDiscipline(
  request: Request,
  lessonId: number,
): Promise<{ disciplineId: number | null } | { response: Response }> {
  const lookup = await getDisciplineIdForLessonId(lessonId);
  if (!lookup.found) {
    return {
      response: await absentResourceResponse(
        request.headers,
        'Lesson not found',
      ),
    };
  }
  return { disciplineId: lookup.disciplineId };
}

function parseLessonId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function patchLessonHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  // Resolve the lesson before guarding: guarding on a null course id would
  // misreport "no such lesson" as "forbidden". The 404 is then answered only
  // to someone on the teaching side — see `absentResourceResponse`, which
  // closes the id-enumeration oracle this ordering would otherwise open.
  //
  // The returned course id is used ONLY as an existence check below (lessons
  // can now have several placements, so "which course" has no single answer
  // — see the branches themselves for how each derives the course that
  // actually matters to it). Do not use this value to guard anything.
  const lessonExistsAt = await getCourseIdForLessonId(lessonId);
  if (lessonExistsAt === null) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Checked before the rest: this body carries only `dependsOn`, and a
  // future optional field on another (non-strict) schema could otherwise
  // swallow a dependency write and silently drop it.
  const dependencies = updateLessonDependenciesInputSchema.safeParse(body);
  if (dependencies.success) {
    // `dependencies.data.courseId` — the course the CLIENT is asking to
    // edit — not `lessonExistsAt` above (only ever "lesson exists, resolved
    // to its lowest-id course" for the earlier 404 check). A lesson taught
    // by several courses has several placements, each with its own
    // prerequisite list; guarding and writing against any course other than
    // the one actually being edited would be wrong even though it's a real
    // course this lesson belongs to. `updateLessonDependencies` itself still
    // rejects a courseId this lesson has no placement in (`not-found`), so a
    // forged value can't write a placement that doesn't exist.
    const denied = await guardStructure(
      request,
      dependencies.data.courseId,
      'update',
    );
    if (denied) return denied;
    const result = await updateLessonDependencies(
      lessonId,
      dependencies.data.courseId,
      dependencies.data.dependsOn,
    );
    if (result.ok) return Response.json(result);
    if (result.reason === 'not-found') {
      return new Response('Not found', { status: 404 });
    }
    return Response.json(
      { error: 'unknown-lessons', slugs: result.slugs },
      { status: 400 },
    );
  }

  const rename = renameLessonInputSchema.safeParse(body);
  if (rename.success) {
    // A rename changes what EVERY course teaching this lesson shows — its
    // authority follows the lesson's DISCIPLINE (or org admin, if it has
    // none), not any one course. See `guardContent`.
    const resolved = await resolveLessonDiscipline(request, lessonId);
    if ('response' in resolved) return resolved.response;
    const denied = await guardContent(request, resolved.disciplineId, 'update');
    if (denied) return denied;
    const updated = await updateLessonName(lessonId, rename.data.name);
    if (!updated) return new Response('Not found', { status: 404 });
    return Response.json(updated);
  }

  const move = moveLessonInputSchema.safeParse(body);
  if (move.success) {
    // A move repoints this lesson's PLACEMENT at `targetModuleId` — that
    // module's course is the one actually being written by `moveLesson`
    // below, and it is not necessarily (or even usually) `lessonExistsAt`,
    // the lesson's lowest-id course. Guarding on the wrong one is wrong in
    // both directions: staff on the lesson's lowest course could move it
    // into a course they have no authority over, and staff on the real
    // target course could be refused for their own course.
    const targetCourseId = await getCourseIdForModuleId(
      move.data.targetModuleId,
    );
    if (targetCourseId === null) {
      return absentResourceResponse(request.headers, 'Target module not found');
    }
    const denied = await guardStructure(request, targetCourseId, 'update');
    if (denied) return denied;
    const updated = await moveLesson({
      lessonId,
      targetModuleId: move.data.targetModuleId,
      prevLessonId: move.data.prevLessonId,
      nextLessonId: move.data.nextLessonId,
    });
    if (!updated) return new Response('Not found', { status: 404 });
    return Response.json(updated);
  }

  const config = updateLessonConfigInputSchema.safeParse(body);
  if (config.success) {
    // Every config field — availability, level tags, the paywall list, the
    // debrief/video-watch gates — is a column on the lesson row
    // (`updateLessonConfig` writes `lessonsTable` by `lessonId` alone, with
    // no course in sight, and invalidates every course teaching this lesson).
    // There is no course-scoped half left to split by field group — its
    // authority follows the lesson's DISCIPLINE, same as rename. See
    // `guardContent`.
    const resolved = await resolveLessonDiscipline(request, lessonId);
    if ('response' in resolved) return resolved.response;
    const denied = await guardContent(request, resolved.disciplineId, 'update');
    if (denied) return denied;
    const updated = await updateLessonConfig(lessonId, config.data);
    if (!updated) return new Response('Not found', { status: 404 });
    return Response.json(updated);
  }

  return Response.json({ error: 'Invalid body' }, { status: 400 });
}

export async function deleteLessonHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  // Existence check only — see the comment in `patchLessonHandler`. Deleting
  // removes the lesson from EVERY course and cascades its progress rows, so
  // this follows the lesson's DISCIPLINE same as rename/config: no single
  // course's staff is the right authority for it. See `guardContent`.
  const lessonExistsAt = await getCourseIdForLessonId(lessonId);
  if (lessonExistsAt === null) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  const resolved = await resolveLessonDiscipline(request, lessonId);
  if ('response' in resolved) return resolved.response;
  const denied = await guardContent(request, resolved.disciplineId, 'delete');
  if (denied) return denied;
  const deleted = await deleteLesson(lessonId);
  if (!deleted) return new Response('Not found', { status: 404 });
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute('/api/admin/lessons/$lessonId')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        patchLessonHandler(request, params.lessonId),
      DELETE: ({ request, params }) =>
        deleteLessonHandler(request, params.lessonId),
    },
  },
});
