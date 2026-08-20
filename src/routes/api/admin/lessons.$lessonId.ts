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
import { getCourseIdForLessonId } from '#/db/lesson-access';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  moveLessonInputSchema,
  renameLessonInputSchema,
  updateLessonConfigInputSchema,
  updateLessonDependenciesInputSchema,
} from '#/lib/admin-schemas';
import { requireCoursePermission } from '#/lib/permissions.server';

/**
 * Course-scoped guard for the structure-only branches (dependencies, rename,
 * move, delete). Returns a 403 Response to short-circuit, or null to proceed.
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

function parseLessonId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * `updateLessonConfigInputSchema` carries fields from two entities: a course
 * manager may set availability and level tags (structure); only a subject
 * expert may change whether a lesson has a debrief or requires its video
 * watched (content).
 */
const STRUCTURE_CONFIG_FIELDS = [
  'isAvailable',
  'levels',
  'requiredSubscriptions',
] as const;
const CONTENT_CONFIG_FIELDS = ['hasDebrief', 'needsVideoWatch'] as const;

/**
 * Guard the config PATCH body per field group it touches. The client sends
 * one field at a time, so a mixed body is theoretical — but it must require
 * BOTH permissions rather than whichever group happens to be checked first,
 * and a refusal on either half must leave the write untouched: no partial
 * permission may produce a partial write.
 */
async function guardConfig(
  request: Request,
  courseId: number,
  patch: Record<string, unknown>,
): Promise<Response | null> {
  const touchesStructure = STRUCTURE_CONFIG_FIELDS.some((f) => f in patch);
  const touchesContent = CONTENT_CONFIG_FIELDS.some((f) => f in patch);

  try {
    if (touchesStructure) {
      await requireCoursePermission(
        request.headers,
        courseId,
        'structure',
        'update',
      );
    }
    if (touchesContent) {
      await requireCoursePermission(
        request.headers,
        courseId,
        'content',
        'update',
      );
    }
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

export async function patchLessonHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  // Resolve the course before guarding: a lesson that doesn't exist must
  // 404, not 403 — guarding on a null course id would misreport "no such
  // lesson" as "forbidden".
  const courseId = await getCourseIdForLessonId(lessonId);
  if (courseId === null) {
    return Response.json({ error: 'Lesson not found' }, { status: 404 });
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
    const denied = await guardStructure(request, courseId, 'update');
    if (denied) return denied;
    const result = await updateLessonDependencies(
      lessonId,
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
    const denied = await guardStructure(request, courseId, 'update');
    if (denied) return denied;
    const updated = await updateLessonName(lessonId, rename.data.name);
    if (!updated) return new Response('Not found', { status: 404 });
    return Response.json(updated);
  }

  const move = moveLessonInputSchema.safeParse(body);
  if (move.success) {
    const denied = await guardStructure(request, courseId, 'update');
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
    const denied = await guardConfig(request, courseId, config.data);
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
  const courseId = await getCourseIdForLessonId(lessonId);
  if (courseId === null) {
    return Response.json({ error: 'Lesson not found' }, { status: 404 });
  }
  const denied = await guardStructure(request, courseId, 'delete');
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
