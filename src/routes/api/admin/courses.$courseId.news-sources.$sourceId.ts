import { createFileRoute } from '@tanstack/react-router';
import {
  deleteNewsSource,
  reorderNewsSource,
  updateNewsSource,
} from '#/db/news-sources';
import { ForbiddenError } from '#/lib/admin-functions.server';
import {
  reorderNewsSourceInputSchema,
  updateNewsSourceInputSchema,
} from '#/lib/admin-schemas';
import { requireCoursePermission } from '#/lib/permissions.server';

async function guard(
  request: Request,
  courseId: number,
  action: 'update' | 'delete',
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

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Resolves both path ids and the guard, or the Response that ends the request. */
async function resolve(
  request: Request,
  courseIdRaw: string,
  sourceIdRaw: string,
  action: 'update' | 'delete',
): Promise<{ courseId: number; sourceId: number } | Response> {
  const courseId = parseId(courseIdRaw);
  const sourceId = parseId(sourceIdRaw);
  if (courseId === null || sourceId === null) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }
  const denied = await guard(request, courseId, action);
  if (denied) return denied;
  return { courseId, sourceId };
}

export async function patchNewsSourceHandler(
  request: Request,
  courseIdRaw: string,
  sourceIdRaw: string,
): Promise<Response> {
  const resolved = await resolve(request, courseIdRaw, sourceIdRaw, 'update');
  if (resolved instanceof Response) return resolved;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // A reorder and a field edit arrive at the same URL; the neighbour keys are
  // what distinguish them. Checked before the field parse so a reorder payload
  // is never rejected for missing `name`.
  const looksLikeReorder =
    typeof body === 'object' &&
    body !== null &&
    ('prevSourceId' in body || 'nextSourceId' in body);

  if (looksLikeReorder) {
    const parsed = reorderNewsSourceInputSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const moved = await reorderNewsSource({
      courseId: resolved.courseId,
      sourceId: resolved.sourceId,
      prevSourceId: parsed.data.prevSourceId,
      nextSourceId: parsed.data.nextSourceId,
    });
    if (!moved) {
      return Response.json(
        { error: 'Source or neighbor not found in this course' },
        { status: 404 },
      );
    }
    return Response.json(moved);
  }

  const parsed = updateNewsSourceInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const result = await updateNewsSource(
    resolved.courseId,
    resolved.sourceId,
    parsed.data,
  );
  if (!result.ok) {
    if (result.reason === 'duplicate_url') {
      return Response.json(
        {
          error: 'This course already has a source with this URL',
          field: 'url',
        },
        { status: 409 },
      );
    }
    return Response.json({ error: 'News source not found' }, { status: 404 });
  }
  return Response.json(result.source);
}

export async function deleteNewsSourceHandler(
  request: Request,
  courseIdRaw: string,
  sourceIdRaw: string,
): Promise<Response> {
  const resolved = await resolve(request, courseIdRaw, sourceIdRaw, 'delete');
  if (resolved instanceof Response) return resolved;

  const removed = await deleteNewsSource(resolved.courseId, resolved.sourceId);
  if (!removed) {
    return Response.json({ error: 'News source not found' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/news-sources/$sourceId',
)({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        patchNewsSourceHandler(request, params.courseId, params.sourceId),
      DELETE: ({ request, params }) =>
        deleteNewsSourceHandler(request, params.courseId, params.sourceId),
    },
  },
});
