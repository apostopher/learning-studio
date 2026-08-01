import { createFileRoute } from '@tanstack/react-router';
import { getLessonMaterial, type LessonMaterial } from '#/db/lesson';
import { recordLessonVisit } from '#/db/lesson-visit';
import { auth } from '#/lib/auth';
import {
  type LessonMaterialResponse,
  lockedResponse,
} from '#/lib/lesson-gating';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';
import { partitionQuiz } from '#/lib/lesson-quiz';

/**
 * The exact union the four UI surfaces switch on. Every success body is
 * assigned to this type before serialising, so a drift between what the route
 * emits and what `lessonMaterialAtomFamily` claims to receive is a tsc error
 * rather than a runtime surprise in a component.
 */
type MaterialPayload = LessonMaterialResponse<NonNullable<LessonMaterial>>;

/**
 * Surface quiz questions the client will have to drop.
 *
 * The quiz UI filters unaskable questions (no correct option, fewer than two
 * options, duplicate ids) rather than showing a student a question that marks
 * them wrong and highlights nothing. Dropping quietly would hide an authoring
 * bug from everyone, so it is reported here — Sentry is initialised on the
 * server only (`instrument.server.mjs`), so a client-side capture would go
 * nowhere. Imported dynamically to keep the SDK out of any client chunk, and
 * never allowed to affect the response.
 */
function reportUnaskableQuizQuestions(
  lessonSlug: string,
  quiz: NonNullable<LessonMaterial>['quiz'],
): void {
  const { droppedIds } = partitionQuiz(quiz);
  if (droppedIds.length === 0) return;

  import('@sentry/tanstackstart-react')
    .then((Sentry) => {
      Sentry.captureMessage('Unaskable quiz questions dropped', {
        level: 'warning',
        extra: { lessonSlug, droppedIds },
      });
    })
    .catch(() => {
      console.warn(
        `Unaskable quiz questions on ${lessonSlug}: ${droppedIds.join(', ')}`,
      );
    });
}

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

    const locked: MaterialPayload | null = lockedResponse(
      gate.lessonLock,
      gate.materialLock,
    );
    if (locked) return Response.json(locked);

    // Record the visit HERE — past the gate, before the material lookup.
    //
    // Past the gate, because reaching this line is server-verified proof the
    // learner was let in and is being served content; a lock screen is a door
    // they bounced off. Before the lookup, because the next block 404s when a
    // lesson has no material row, and a published lesson with no video and no
    // material would otherwise never record a visit — leaving it stuck below
    // 100% forever, which is exactly the case the visit rule exists to score.
    //
    // Recorded on the admin-bypass path too. Admins bypass every gate, so
    // their progress numbers carry no meaning worth protecting with a branch.
    //
    // Swallowed on failure, never allowed to fail the response: the learner
    // came here for the material. A dropped write self-corrects, because this
    // request repeats on the next visit once the client cache expires — which
    // is why this lives here rather than on the fire-and-forget beacon, whose
    // failures are invisible and unretryable.
    try {
      await recordLessonVisit({ userId: session.user.id, lessonSlug });
    } catch (error) {
      console.error('Failed to record lesson visit:', error);
    }

    const material = await getLessonMaterial(lessonSlug);
    if (!material) {
      return Response.json(
        { error: 'Lesson material not found' },
        { status: 404 },
      );
    }
    reportUnaskableQuizQuestions(lessonSlug, material.quiz);

    const payload: MaterialPayload = {
      locked: false,
      adminBypass: gate.isAdmin,
      material,
    };
    return Response.json(payload);
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
