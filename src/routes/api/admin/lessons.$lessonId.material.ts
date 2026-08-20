import { createFileRoute } from '@tanstack/react-router';
import { getLessonMaterialByLessonId, upsertLessonMaterial } from '#/db/lesson';
import { getCourseIdForLessonId } from '#/db/lesson-access';
import { ForbiddenError } from '#/lib/admin-functions.server';
import type { PermissionAction } from '#/lib/admin-schemas';
import { requireCoursePermission } from '#/lib/permissions.server';
import { LessonMaterialGenerationSchema } from '#/types';

/**
 * Material is content: a course manager may read it, only a subject expert
 * may write it.
 */
async function guard(
  request: Request,
  courseId: number,
  action: PermissionAction,
): Promise<Response | null> {
  try {
    await requireCoursePermission(request.headers, courseId, 'content', action);
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

export async function getMaterialHandler(
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
  const denied = await guard(request, courseId, 'read');
  if (denied) return denied;
  const material = await getLessonMaterialByLessonId(lessonId);
  return Response.json(material ?? null);
}

export async function saveMaterialHandler(
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
  const denied = await guard(request, courseId, 'update');
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = LessonMaterialGenerationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid material' }, { status: 400 });
  }

  let saved: Awaited<ReturnType<typeof upsertLessonMaterial>>;
  try {
    saved = await upsertLessonMaterial(lessonId, parsed.data);
  } catch (error) {
    console.error('Failed to save lesson material:', error);
    return Response.json(
      { error: 'Failed to save the material. Please try again.' },
      { status: 500 },
    );
  }
  if (!saved) return new Response('Not found', { status: 404 });
  return Response.json(saved);
}

export const Route = createFileRoute('/api/admin/lessons/$lessonId/material')({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        getMaterialHandler(request, params.lessonId),
      POST: ({ request, params }) =>
        saveMaterialHandler(request, params.lessonId),
    },
  },
});
