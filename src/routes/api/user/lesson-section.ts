import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { recordLessonSectionTap } from '#/db/lesson-visit';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';
import { TRACKED_LESSON_SECTIONS } from '#/lib/lesson-visit-section';
import { settleProgress } from '#/lib/settle-progress.server';

const sectionTapSchema = z.object({
  lessonSlug: z.string().min(1),
  // The course the learner is in, from the route they are on — a lesson can
  // be placed in several courses, each with its own gate, so it cannot be
  // inferred from the slug.
  courseSlug: z.string().min(1),
  // Enumerated, not a free string. The section name is a component of this
  // table's unique index, so an unconstrained value would let a caller write
  // unbounded rows per lesson — and `LESSON_VISIT_SECTION` is deliberately not
  // in this list, so a client can never forge the server-verified page visit.
  section: z.enum(TRACKED_LESSON_SECTIONS),
});

/**
 * Record that the logged-in learner opened a material tab.
 *
 * Any user SUBSCRIBED to the course may record their own tap on a lesson the
 * gate has released: the user comes from the session rather than the body, and
 * the section is enumerated. The prerequisite and video LOCKS are enforced,
 * unlike `/api/user/last-viewed`, because a tap moves progress: it can
 * complete a lesson, which the debrief clock and the next lesson's unlock read.
 *
 * The LEVEL check is enforced for the same reason — the progress ring is not
 * cosmetic: tapped sections feed `lessonPercent`, a
 * lesson reaching 100% is recorded as the sticky `done`, and the level gate
 * reads `done` to decide whether an out-of-tier lesson opens read-only.
 * Without this, a caller could tap their way to 100% on a material-only
 * lesson outside their tier and turn its `403 out-of-tier` into a 200 with the
 * full material.
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
    courseSlug: parsed.data.courseSlug,
  });
  // A signed-in caller is not automatically a subscriber. `evaluateLessonGate`
  // has always answered this question; this route just never asked it. It is
  // load-bearing now: what this writes can take a lesson to 100%, and in a
  // video-less course `settleProgress` then records the completion and runs
  // promotion, which can write a durable level row and send a real promotion
  // email — for a course the caller does not own. A null gate (no such
  // lesson, or a WIP one) collapses into the same 403 rather than a
  // distinguishable 404, matching report-video-progress and the playback
  // route: telling the two apart hands an enumeration oracle to any signed-in
  // caller.
  if (!gate?.subscribed) {
    return new Response('Forbidden', { status: 403 });
  }

  // Refuse an out-of-tier lesson, in BOTH read-only states: this is a write,
  // and an archive view must not write anything. It matters because what it
  // writes feeds `lessonPercent`, a lesson reaching 100% is recorded as the
  // sticky `done`, and `done` is exactly what the gate reads to decide
  // `readOnly` — so a caller could POST their way from a `403 out-of-tier` to
  // a 200 serving the full material.
  //
  // Under strict levels an untagged lesson, a lesson at another level, and
  // every lesson for a pilot with no level is either refused outright or held
  // only as a read-only archive, so a write to it has no legitimate origin.
  if (gate?.outOfTier) {
    return new Response('Forbidden', { status: 403 });
  }

  // Refuse a locked lesson too, prerequisite or video. The tab only renders
  // inside material the gate released, so a write here has no legitimate
  // origin — and what it writes can take a video-less lesson to 100%, record
  // it done, and unlock the next lesson without the pilot having earned it.
  // Same 403 as every other refusal, so the route is not an oracle.
  if (gate.lessonLock.kind !== 'open' || gate.materialLock.kind !== 'open') {
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

  // Best-effort: `settleProgress` never throws, so a settle failure cannot fail
  // the tap the pilot actually recorded.
  const promotion = await settleProgress({
    userId: session.user.id,
    courseSlug: gate.courseSlug,
  });

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
