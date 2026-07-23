import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { recordVideoProgress } from '#/db/videos-progress';
import { auth } from '#/lib/auth';

const reportVideoProgressSchema = z.object({
  videoId: z.string().min(1),
  progress: z.number().int().min(0).max(100),
});

/**
 * Record a video-progress milestone for the logged-in user (append-only).
 * Any authenticated user may report their own progress — no admin role needed.
 */
export async function reportVideoProgressHandler(
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

  const parsed = reportVideoProgressSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await recordVideoProgress({
      userId: session.user.id,
      videoId: parsed.data.videoId,
      progress: parsed.data.progress,
    });
  } catch (error) {
    console.error('Failed to record video progress:', error);
    return Response.json({ error: 'Failed to save progress' }, { status: 500 });
  }

  return Response.json({ message: 'Video progress saved' }, { status: 201 });
}

export const Route = createFileRoute('/api/user/report-video-progress')({
  server: {
    handlers: {
      POST: ({ request }) => reportVideoProgressHandler(request),
    },
  },
});
