import { createFileRoute } from '@tanstack/react-router';
import { getLessonMaterialByLessonId, upsertLessonMaterial } from '#/db/lesson';
import { getDisciplineIdForLessonId } from '#/db/lesson-access';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  absentResourceResponse,
  requireLessonContentPermission,
} from '#/lib/permissions.server';
import { LessonMaterialGenerationSchema } from '#/types';

/**
 * Material is lesson content: it changes what EVERY course teaching this
 * lesson shows, not just one. Authority follows the lesson's DISCIPLINE — the
 * SME who owns it — falling back to org-level admin only when the lesson has
 * none ("Untitled"). See `requireLessonContentPermission`.
 *
 * Also serves as the existence check: `getDisciplineIdForLessonId` resolves
 * the lesson directly against `lessonsTable`, so "no such lesson" (404, via
 * `absentResourceResponse`) is told apart from "lesson exists with no
 * discipline" (admin-only) here, before any guard runs.
 */
async function guard(
  request: Request,
  lessonId: number,
  action: 'read' | 'update',
): Promise<Response | null> {
  const lookup = await getDisciplineIdForLessonId(lessonId);
  if (!lookup.found) {
    return absentResourceResponse(request.headers, 'Lesson not found');
  }
  try {
    await requireLessonContentPermission(
      request.headers,
      lookup.disciplineId,
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

export async function getMaterialHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  const denied = await guard(request, lessonId, 'read');
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
  const denied = await guard(request, lessonId, 'update');
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
