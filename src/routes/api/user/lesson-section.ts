import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { recordLessonSectionTap } from '#/db/lesson-visit';
import { auth } from '#/lib/auth';
import { TRACKED_LESSON_SECTIONS } from '#/lib/lesson-visit-section';

const sectionTapSchema = z.object({
  lessonSlug: z.string().min(1),
  // Enumerated, not a free string. The section name is a component of this
  // table's unique index, so an unconstrained value would let a caller write
  // unbounded rows per lesson — and `LESSON_VISIT_SECTION` is deliberately not
  // in this list, so a client can never forge the server-verified page visit.
  section: z.enum(TRACKED_LESSON_SECTIONS),
});

/**
 * Record that the logged-in learner opened a material tab.
 *
 * Any authenticated user may record their own tap: it is their own navigation
 * within content they are already being served, the user comes from the
 * session rather than the body, and the section is enumerated. The lesson GATE
 * is deliberately not re-checked, matching `/api/user/last-viewed` — the tab
 * only renders inside material the gate already released, and re-running a
 * full progress aggregation on every tab tap would cost far more than the
 * worst forgery achieves (a learner inflating their own progress ring, which
 * gates nothing — see D1).
 */
export async function recordLessonSectionHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = sectionTapSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await recordLessonSectionTap({
      userId: session.user.id,
      lessonSlug: parsed.data.lessonSlug,
      section: parsed.data.section,
    });
  } catch (error) {
    console.error('Failed to record lesson section tap:', error);
    return Response.json({ error: 'Failed to save' }, { status: 500 });
  }

  return Response.json({ message: 'Section recorded' }, { status: 201 });
}

export const Route = createFileRoute('/api/user/lesson-section')({
  server: {
    handlers: {
      POST: ({ request }) => recordLessonSectionHandler(request),
    },
  },
});
