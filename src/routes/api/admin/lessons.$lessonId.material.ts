import { createFileRoute } from '@tanstack/react-router';
import { getLessonMaterialByLessonId, upsertLessonMaterial } from '#/db/lesson';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { LessonMaterialGenerationSchema } from '#/types';

async function guard(request: Request): Promise<Response | null> {
  try {
    await requireAdmin(request.headers);
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
  const denied = await guard(request);
  if (denied) return denied;
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 });
  }
  const material = await getLessonMaterialByLessonId(lessonId);
  return Response.json(material ?? null);
}

export async function saveMaterialHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
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
