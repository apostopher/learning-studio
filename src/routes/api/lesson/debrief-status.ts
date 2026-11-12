import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import type { AIEvaluationResult, AITestQuestion } from '#/ai/schemas';
import { getCourseProgress } from '#/db/course-progress';
import { getDebriefAttemptReports } from '#/db/lesson-test';
import { auth } from '#/lib/auth';
import type { OutstandingItem } from '#/lib/course-progress-agg';
import { getDebriefAccess } from '#/lib/debrief-access.server';
import type { DebriefState } from '#/lib/debrief-schedule';

const QuerySchema = z.object({
  lessonSlug: z.string().min(1),
  courseSlug: z.string().min(1),
});

export type DebriefStatusAttempt = {
  id: number;
  totalScore: number;
  completedAt: string;
  passed: boolean;
  /** What `ScoreReport` renders for this attempt. */
  questions: AITestQuestion[];
  evaluations: AIEvaluationResult[];
};

export type DebriefStatusResponse = {
  state: DebriefState;
  /**
   * What is left to start the debrief clock; non-empty only when `not-done`.
   * Just the video when the lesson asks for one (watching it starts the
   * clock), otherwise everything left to finish the lesson.
   */
  lessonOutstanding: OutstandingItem[];
  /**
   * Present ONLY when state.kind === 'passed' — history is hidden until then.
   * Passing attempts first, then newest first.
   */
  attempts?: DebriefStatusAttempt[];
};

/**
 * Which state this pilot's debrief is in, for the Debrief tab. Every refusal is
 * `getDebriefAccess`'s, passed through unchanged.
 */
export async function debriefStatusHandler(
  request: Request,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    lessonSlug: searchParams.get('lessonSlug'),
    courseSlug: searchParams.get('courseSlug'),
  });
  if (!parsed.success) {
    return Response.json(
      { error: 'lessonSlug and courseSlug are required' },
      { status: 400 },
    );
  }
  const { lessonSlug, courseSlug } = parsed.data;
  const userId = session.user.id;

  try {
    const access = await getDebriefAccess({
      userId,
      lessonSlug,
      courseSlug,
      now: new Date(),
    });
    if (!access.ok) {
      return Response.json(
        { error: access.status === 404 ? 'Not found' : 'Forbidden' },
        { status: access.status },
      );
    }
    const { state } = access;

    let lessonOutstanding: OutstandingItem[] = [];
    if (state.kind === 'not-done') {
      const progress = await getCourseProgress({ userId, slug: courseSlug });
      const lesson = progress.lessons.find(
        (l) => l.lessonId === access.lessonId,
      );
      const outstanding = lesson?.outstanding ?? [];
      // On a video lesson only the full watch starts the clock — even one
      // done without its (optional) video — so the video is all there is to say.
      lessonOutstanding =
        lesson?.debrief?.hasVideo || outstanding.some((i) => i.kind === 'video')
          ? [{ kind: 'video' }]
          : outstanding;
    }

    const body: DebriefStatusResponse = { state, lessonOutstanding };
    if (state.kind === 'passed') {
      const attempts = await getDebriefAttemptReports(userId, lessonSlug);
      // Array#sort is stable: the newest-first order survives within a group.
      body.attempts = [
        ...attempts.filter((a) => a.passed),
        ...attempts.filter((a) => !a.passed),
      ];
    }
    return Response.json(body);
  } catch (error) {
    console.error('Failed to load debrief status:', error);
    return Response.json(
      { error: 'Failed to load debrief status' },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute('/api/lesson/debrief-status')({
  server: {
    handlers: { GET: ({ request }) => debriefStatusHandler(request) },
  },
});
