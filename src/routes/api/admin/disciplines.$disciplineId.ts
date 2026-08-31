import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { deleteDiscipline, renameDiscipline } from '#/db/disciplines';
import { getActiveOrgId } from '#/lib/active-org.server';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import { renameDisciplineInputSchema } from '#/lib/discipline-schemas';

/**
 * `requireAdmin`, never `requireDisciplinePermission` — see the long note on
 * `disciplines.ts`'s guard. Creating and destroying disciplines is the shape
 * of the org; an SME authors inside one and must not be able to remove the one
 * they hold (or any other).
 */
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

export function parseDisciplineId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Rename. The slug minted at creation is left alone — see `renameDiscipline`. */
export async function patchDisciplineHandler(
  request: Request,
  disciplineIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const disciplineId = parseDisciplineId(disciplineIdRaw);
  if (disciplineId === null) {
    return Response.json({ error: 'Invalid discipline id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = renameDisciplineInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await renameDiscipline(
    getActiveOrgId(),
    disciplineId,
    parsed.data.name,
  );
  if (!result.ok) {
    return result.reason === 'duplicate-name'
      ? Response.json(
          {
            error: 'A discipline with this name already exists',
            field: 'name',
          },
          { status: 409 },
        )
      : Response.json({ error: 'Discipline not found' }, { status: 404 });
  }
  return Response.json(result.discipline);
}

/**
 * Delete — refused, legibly, while the discipline still holds lessons.
 *
 * `lessons.discipline_id` is `on delete no action`, so the alternative to this
 * 409 is a foreign-key violation surfacing as a 500 that tells the admin
 * nothing. The message names the count because the count is the whole
 * instruction: it says how much work stands between them and the delete, and
 * the library editor is where that work is done. Nothing is reassigned on
 * their behalf — moving an SME's lessons into the admin-only "Untitled" queue
 * would strip that expert's authorship of every one of them as a side effect
 * of a click aimed at something else.
 *
 * `lessonCount` rides in the body as a number as well as being written into
 * the sentence, so the screen can put the refusal next to the row it belongs
 * to without parsing English back out of it.
 */
export async function deleteDisciplineHandler(
  request: Request,
  disciplineIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const disciplineId = parseDisciplineId(disciplineIdRaw);
  if (disciplineId === null) {
    return Response.json({ error: 'Invalid discipline id' }, { status: 400 });
  }

  const result = await deleteDiscipline(getActiveOrgId(), disciplineId);
  if (result.ok) return new Response(null, { status: 204 });

  if (result.reason === 'has-lessons') {
    const noun = result.lessonCount === 1 ? 'lesson' : 'lessons';
    return Response.json(
      {
        error: `This discipline still has ${result.lessonCount} ${noun}. Move them to another discipline in the knowledge library first, then delete it.`,
        lessonCount: result.lessonCount,
      },
      { status: 409 },
    );
  }
  return Response.json({ error: 'Discipline not found' }, { status: 404 });
}

export const Route = createFileRoute('/api/admin/disciplines/$disciplineId')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        patchDisciplineHandler(request, params.disciplineId),
      DELETE: ({ request, params }) =>
        deleteDisciplineHandler(request, params.disciplineId),
    },
  },
});
