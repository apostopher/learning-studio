import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { recordLessonSectionTap } from '#/db/lesson-visit';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';
import { TRACKED_LESSON_SECTIONS } from '#/lib/lesson-visit-section';
import type { Promotion } from '#/lib/promotion.server';
import { maybePromote } from '#/lib/promotion.server';

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
 * session rather than the body, and the section is enumerated. The prerequisite
 * LOCKS are deliberately not re-checked, matching `/api/user/last-viewed` — the
 * tab only renders inside material the gate already released, and the worst
 * forgery achieves is a learner inflating their own progress ring, which gates
 * nothing (see D1).
 *
 * The LEVEL check is different in kind and IS enforced, because here the
 * progress ring is not cosmetic: tapped sections feed `lessonPercent`, and the
 * level gate reads percent to decide whether an out-of-tier lesson opens
 * read-only. Without this, a caller could tap their way to 100% on a
 * material-only lesson outside their tier and turn its `403 out-of-tier` into
 * a 200 with the full material.
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

  const gate = await evaluateLessonGate({
    userId: session.user.id,
    lessonSlug: parsed.data.lessonSlug,
  });
  // Refuse an out-of-tier lesson, in BOTH read-only states: this is a write,
  // and an archive view must not write anything. It matters because what it
  // writes feeds `lessonPercent`, and percent is exactly what the gate reads
  // to decide `readOnly` — so a caller could POST their way from a
  // `403 out-of-tier` to a 200 serving the full material.
  //
  // `lessonLock`/`materialLock` are deliberately NOT honoured here. Refusing
  // on those would newly 403 flows that succeed today, which is a separate
  // decision with its own blast radius (see this handler's doc comment).
  // Refusing on `outOfTier` alone breaks nothing that currently works: every
  // lesson ships with `levels = '{}'`, so nothing is out of tier until an
  // author tags one — which is precisely when this should start to bite.
  if (gate?.outOfTier) {
    return new Response('Forbidden', { status: 403 });
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

  // Best-effort: a promotion-check failure must never fail the tap the pilot
  // actually recorded. `gate` is null only when the lesson itself doesn't
  // exist/isn't available, in which case there is no course to promote in.
  let promotion: Promotion | null = null;
  if (gate) {
    try {
      promotion = await maybePromote({
        userId: session.user.id,
        courseSlug: gate.courseSlug,
      });
    } catch (error) {
      console.error(
        'Promotion check failed; progress was still recorded.',
        error,
      );
    }
  }

  return Response.json(
    { message: 'Section recorded', promotion },
    { status: 201 },
  );
}

export const Route = createFileRoute('/api/user/lesson-section')({
  server: {
    handlers: {
      POST: ({ request }) => recordLessonSectionHandler(request),
    },
  },
});
