import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { createOffering, listOfferings } from '#/db/offerings';
import { ForbiddenError } from '#/lib/admin-functions.server';
import { auth } from '#/lib/auth';
import {
  calendarDaySchema,
  createOfferingInputSchema,
} from '#/lib/offering-schemas';
import {
  getStaffScopedCourseIds,
  requireCourseCreation,
  requirePermission,
} from '#/lib/permissions.server';

/**
 * Offerings — dated runs of a course.
 *
 * Authority deliberately mirrors `/api/admin/courses`, because the two answer
 * the same question about the same objects:
 *
 * - READ is `course:read`, falling back to the actor's staffed courses. A
 *   subject expert holds no `course:read` (that grant is the whole
 *   catalogue), but must still see the schedule for courses they work on.
 * - WRITE is `requireCourseCreation` — the course-manager-or-admin union from
 *   RBAC rule 5. Scheduling a course to run is the same class of decision as
 *   putting it in the catalogue, so it takes the same authority. Notably NOT
 *   `requirePermission`, whose admin floor would refuse every course manager.
 *
 * Each handler guards itself. No handler here trusts the route it is mounted
 * under, or the client.
 */
async function guardWrite(request: Request): Promise<Response | null> {
  try {
    await requireCourseCreation(request.headers);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

/**
 * The acting user, for attribution only.
 *
 * Read AFTER `guardWrite` has already decided the caller may write, so this
 * never decides anything — which is why a missing session degrades to `null`
 * (an unattributed row) instead of a refusal. `requireCourseCreation` returns
 * void rather than the actor, so the session is read a second time here; the
 * alternative is widening that shared guard's contract for one caller.
 */
export async function actingUserId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user?.id ?? null;
}

/**
 * The offerings overlapping a date window.
 *
 * The window is required rather than defaulted. A schedule grid always knows
 * which weeks it is showing, and a defaulted window would quietly return a
 * different set than the one being drawn — the bug where a bar is missing
 * only when you scroll far enough.
 */
export async function listOfferingsHandler(
  request: Request,
): Promise<Response> {
  // Authorize BEFORE validating the query string. The other order answered an
  // unauthenticated caller with a 400 describing the parameters this endpoint
  // wants — telling someone who may not use it how to call it.
  let courseIds: number[] | undefined;
  try {
    await requirePermission(request.headers, 'course', 'read');
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
    const staffCourseIds = await getStaffScopedCourseIds(request.headers);
    // Consistent with the courses endpoint: staffed on nothing is a refusal,
    // not an empty schedule. An empty grid would read as "nothing is
    // scheduled" when the truth is "you may not see it".
    if (staffCourseIds.length === 0) {
      return new Response('Forbidden', { status: 403 });
    }
    courseIds = staffCourseIds;
  }

  const window = parseWindow(new URL(request.url));
  if (!window) {
    return Response.json(
      { error: 'from and to are required, as yyyy-MM-dd' },
      { status: 400 },
    );
  }

  return Response.json(
    await listOfferings(courseIds ? { ...window, courseIds } : window),
  );
}

/** Parse and validate the `from`/`to` window, or null if it is unusable. */
function parseWindow(
  url: URL,
): { windowStart: string; windowEnd: string } | null {
  const from = calendarDaySchema.safeParse(url.searchParams.get('from') ?? '');
  const to = calendarDaySchema.safeParse(url.searchParams.get('to') ?? '');
  if (!from.success || !to.success) return null;
  // `yyyy-MM-dd` compares lexicographically in date order.
  if (to.data < from.data) return null;
  return { windowStart: from.data, windowEnd: to.data };
}

export async function createOfferingHandler(
  request: Request,
): Promise<Response> {
  const denied = await guardWrite(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createOfferingInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const actorId = await actingUserId(request.headers);
  return Response.json(await createOffering(parsed.data, actorId), {
    status: 201,
  });
}

export const Route = createFileRoute('/api/admin/offerings')({
  server: {
    handlers: {
      GET: ({ request }) => listOfferingsHandler(request),
      POST: ({ request }) => createOfferingHandler(request),
    },
  },
});
