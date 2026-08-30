import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { getOrgLibrary } from '#/db/editor';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';

/** The whole org's knowledge library, grouped by discipline. Org-level, not per-course. */
export async function getLibraryHandler(request: Request): Promise<Response> {
  try {
    await requireAdmin(request.headers);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }

  return Response.json(await getOrgLibrary(getActiveOrgId()));
}

export const Route = createFileRoute('/api/admin/library')({
  server: {
    handlers: {
      GET: ({ request }) => getLibraryHandler(request),
    },
  },
});
