import { createFileRoute } from '@tanstack/react-router';
import { getCourseOnboarding, updateCourseOnboarding } from '#/db/admin';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { OnboardingQuestionsSchema } from '#/types';

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

function parseCourseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function getOnboardingHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  return Response.json(await getCourseOnboarding(courseId));
}

export async function postOnboardingHandler(
  request: Request,
  courseIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  const courseId = parseCourseId(courseIdRaw);
  if (courseId === null) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = OnboardingQuestionsSchema.safeParse(
    (body as { questions?: unknown })?.questions,
  );
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return Response.json(await updateCourseOnboarding(courseId, parsed.data));
}

export const Route = createFileRoute('/api/admin/courses/$courseId/onboarding')(
  {
    server: {
      handlers: {
        GET: ({ request, params }) =>
          getOnboardingHandler(request, params.courseId),
        POST: ({ request, params }) =>
          postOnboardingHandler(request, params.courseId),
      },
    },
  },
);
