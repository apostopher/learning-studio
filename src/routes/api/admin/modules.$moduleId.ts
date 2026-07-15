import { createFileRoute } from '@tanstack/react-router';
import { deleteModule, reorderModule, updateModule } from '@/db/admin';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';
import {
  reorderModuleInputSchema,
  updateModuleInputSchema,
} from '@/lib/admin-schemas';

/** Admin guard — returns a 403 Response to short-circuit, or null to proceed. */
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

function parseModuleId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const Route = createFileRoute('/api/admin/modules/$moduleId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const denied = await guard(request);
        if (denied) return denied;
        const moduleId = parseModuleId(params.moduleId);
        if (moduleId === null) {
          return Response.json({ error: 'Invalid module id' }, { status: 400 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const update = updateModuleInputSchema.safeParse(body);
        if (update.success) {
          const updated = await updateModule(moduleId, update.data);
          if (!updated) return new Response('Not found', { status: 404 });
          return Response.json(updated);
        }

        const reorder = reorderModuleInputSchema.safeParse(body);
        if (reorder.success) {
          const updated = await reorderModule({
            moduleId,
            prevModuleId: reorder.data.prevModuleId,
            nextModuleId: reorder.data.nextModuleId,
          });
          if (!updated) return new Response('Not found', { status: 404 });
          return Response.json(updated);
        }

        return Response.json({ error: 'Invalid body' }, { status: 400 });
      },

      DELETE: async ({ request, params }) => {
        const denied = await guard(request);
        if (denied) return denied;
        const moduleId = parseModuleId(params.moduleId);
        if (moduleId === null) {
          return Response.json({ error: 'Invalid module id' }, { status: 400 });
        }
        const deleted = await deleteModule(moduleId);
        if (!deleted) return new Response('Not found', { status: 404 });
        return new Response(null, { status: 204 });
      },
    },
  },
});
