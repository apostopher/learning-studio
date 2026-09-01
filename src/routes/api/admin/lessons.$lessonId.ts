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
 * The SOLE existence check for `rename`, `config`, and `deleteLessonHandler`
 * — resolving the discipline `guardContent` needs to decide SME-vs-admin.
 *
 * Deliberately NOT `getCourseIdForLessonId` (the join-based check `move` and
 * `dependencies` use): that check reads through `module_lessons`, so it
 * reports "not found" for a lesson with zero course placements too — and
 * `lessons.disciplineId`'s own doc comment makes that state a design goal
 * of the knowledge library ("an UNPLACED lesson — new, or removed from
 * every course — still has a home and still appears in the library"). A
 * lesson content route 404ing an unplaced lesson for its own discipline SME
 * would make it permanently unrenameable and undeletable the moment
 * remove-from-course ships. `getDisciplineIdForLessonId` queries
 * `lessonsTable` directly, so it answers "does the lesson exist" without
 * going anywhere near its placements.
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
    // A prerequisite list is a property of a PLACEMENT — this lesson, in
    // THIS course — so its existence check is join-based through
    // `module_lessons`, same as the guard target below: a lesson with no
    // placement in any course (an unplaced, library-only lesson) has no
    // course-scoped dependency list to guard or write, and 404 is the
    // honest answer for this branch specifically. That is NOT the same
    // question as "does the lesson exist" — see `resolveLessonDiscipline`,
    // which `rename`/`config`/`delete` use instead, precisely because they
    // must NOT 404 an unplaced lesson.
    const lessonExistsAt = await getCourseIdForLessonId(lessonId);
    if (lessonExistsAt === null) {
      return absentResourceResponse(request.headers, 'Lesson not found');
    }
    // `dependencies.data.courseId` — the course the CLIENT is asking to
    // edit — not `lessonExistsAt` above (only ever "lesson exists, resolved
    // to its lowest-id course" for the existence check just above). A
    // lesson taught by several courses has several placements, each with
    // its own prerequisite list; guarding and writing against any course
    // other than the one actually being edited would be wrong even though
    // it's a real course this lesson belongs to. `updateLessonDependencies`
    // itself still rejects a courseId this lesson has no placement in
    // (`not-found`), so a forged value can't write a placement that
    // doesn't exist.
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
    // A move repositions an existing PLACEMENT — there is nothing to move
    // for a lesson with no placement in any course (an unplaced,
    // library-only lesson), so this existence check is join-based through
    // `module_lessons`, same as `dependencies` above and for the same
    // reason. This is NOT the same question as "does the lesson exist" —
    // see `resolveLessonDiscipline`, used by `rename`/`config`/`delete`.
    const lessonExistsAt = await getCourseIdForLessonId(lessonId);
    if (lessonExistsAt === null) {
      return absentResourceResponse(request.headers, 'Lesson not found');
    }
    // That module's course is the one actually being written by
    // `moveLesson` below, and it is not necessarily (or even usually)
    // `lessonExistsAt`, the lesson's lowest-id course. Guarding on the
    // wrong one is wrong in both directions: staff on the lesson's lowest
    // course could move it into a course they have no authority over, and
    // staff on the real target course could be refused for their own
    // course.
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
  // Deleting removes the lesson from EVERY course and cascades its progress
  // rows, so this follows the lesson's DISCIPLINE same as rename/config: no
  // single course's staff is the right authority for it, and an unplaced
  // (library-only) lesson must still be deletable by its SME — see
  // `resolveLessonDiscipline`, which is this handler's sole existence check.
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
