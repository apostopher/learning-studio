import { createFileRoute } from '@tanstack/react-router';
import { getLessonMaterial } from '#/db/lesson';
import { auth } from '#/lib/auth';
import { lockedResponse } from '#/lib/lesson-gating';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';

/**
 * A lesson's material for the learner, gated.
 *
 * Before this gate existed the route had no auth at all — any unauthenticated
 * request returned the full material for any slug. It now requires a session,
 * a subscription to the lesson's course, and satisfaction of the module,
 * lesson, and video gates.
 *
 * The gate is evaluated BEFORE the material row is read, so a locked lesson
 * never reveals whether material exists, and a locked response never touches
 * the content at all.
 */
export async function getLessonMaterialHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const lessonSlug = new URL(request.url).searchParams.get('lessonSlug');
  if (!lessonSlug) {
    return new Response('lessonSlug is required', { status: 400 });
  }

  try {
    const gate = await evaluateLessonGate({
      userId: session.user.id,
      lessonSlug,
    });
    if (!gate) {
      return Response.json({ error: 'Lesson not found' }, { status: 404 });
    }
    if (!gate.subscribed) {
      return new Response('Forbidden', { status: 403 });
    }

    const locked = lockedResponse(gate.lessonLock, gate.materialLock);
    if (locked) return Response.json(locked);

    const material = await getLessonMaterial(lessonSlug);
    if (!material) {
      return Response.json(
        { error: 'Lesson material not found' },
        { status: 404 },
      );
    }
    return Response.json({
      locked: false,
      adminBypass: gate.isAdmin,
      material,
    });
  } catch (error) {
    // Deliberately a 500, never a lock: a gate that fails closed would tell a
    // student to rewatch a video they already finished, with no way out.
    console.error('Failed to evaluate lesson material gate:', error);
    return Response.json({ error: 'Failed to load material' }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/lesson/material')({
  server: {
    handlers: {
      GET: ({ request }) => getLessonMaterialHandler(request),
    },
  },
});
