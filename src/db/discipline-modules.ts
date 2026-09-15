// src/db/discipline-modules.ts
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { db } from '#/db';
import {
  disciplineModulesTable,
  disciplinesTable,
  lessonsTable,
} from '#/db/schema';

/**
 * Discipline modules: how a discipline's lessons are FILED in the library
 * pane. Nothing here touches a course, a placement, or a learner. Every
 * writer is guarded by its route on the discipline — the module's for module
 * writes, the LESSON's for `placeLessonInLibrary`.
 */

export async function createDisciplineModule(
  disciplineId: number,
  name: string,
): Promise<{ id: number; name: string; rank: number }> {
  // Appended after the discipline's last module — the same rule as
  // `createModule`, so a new box lands where it is visible.
  const [{ maxRank }] = await db
    .select({
      maxRank: sql<string | null>`max(${disciplineModulesTable.rank})`,
    })
    .from(disciplineModulesTable)
    .where(eq(disciplineModulesTable.disciplineId, disciplineId));
  const rank = maxRank === null ? 1 : Number(maxRank) + 1;
  const [created] = await db
    .insert(disciplineModulesTable)
    .values({ disciplineId, name, rank: String(rank) })
    .returning({
      id: disciplineModulesTable.id,
      name: disciplineModulesTable.name,
      rank: disciplineModulesTable.rank,
    });
  return { id: created.id, name: created.name, rank: Number(created.rank) };
}

export async function renameDisciplineModule(
  id: number,
  name: string,
): Promise<{ id: number; name: string } | null> {
  const [updated] = await db
    .update(disciplineModulesTable)
    .set({ name, updatedAt: sql`now()` })
    .where(eq(disciplineModulesTable.id, id))
    .returning({
      id: disciplineModulesTable.id,
      name: disciplineModulesTable.name,
    });
  return updated ?? null;
}

/** The discipline a module belongs to, or null for no such module. */
export async function getDisciplineIdForDisciplineModule(
  id: number,
): Promise<number | null> {
  const [row] = await db
    .select({ disciplineId: disciplineModulesTable.disciplineId })
    .from(disciplineModulesTable)
    .where(eq(disciplineModulesTable.id, id));
  return row?.disciplineId ?? null;
}

/**
 * Move a module between two neighbours OF ITS OWN DISCIPLINE. Neighbour
 * ranks are resolved with a single SELECT scoped to that discipline
 * (`id in (…) and discipline_id = …`) BEFORE any write — a neighbour id
 * from another discipline (or that doesn't exist) simply doesn't come back
 * in the result, and the function returns null having written nothing.
 * Mirrors `reorderModule`.
 *
 * This is deliberately NOT a scalar subquery inlined into the UPDATE: `rank`
 * is NOT NULL, so a stale neighbour's subquery would resolve to SQL NULL,
 * the midpoint arithmetic would resolve to NULL, and the UPDATE would raise
 * a not-null violation (23502) instead of failing softly. Deciding the
 * refusal in JS, before the write, means a NULL can never reach the column.
 */
export async function reorderDisciplineModule(input: {
  moduleId: number;
  prevModuleId: number | null;
  nextModuleId: number | null;
}): Promise<{ id: number; rank: number } | null> {
  const disciplineId = await getDisciplineIdForDisciplineModule(input.moduleId);
  if (disciplineId === null) return null;

  const neighbourIds = [input.prevModuleId, input.nextModuleId].filter(
    (id): id is number => id !== null,
  );
  if (neighbourIds.length === 0) return null;

  const neighbours = await db
    .select({
      id: disciplineModulesTable.id,
      rank: disciplineModulesTable.rank,
    })
    .from(disciplineModulesTable)
    .where(
      and(
        inArray(disciplineModulesTable.id, neighbourIds),
        eq(disciplineModulesTable.disciplineId, disciplineId),
      ),
    );
  const rankById = new Map(neighbours.map((n) => [n.id, Number(n.rank)]));
  // A named neighbour missing here — wrong discipline, or gone — is the
  // stale-neighbour refusal, decided before touching the row being moved.
  if (neighbourIds.some((id) => !rankById.has(id))) return null;

  const prevRank =
    input.prevModuleId !== null ? rankById.get(input.prevModuleId) : undefined;
  const nextRank =
    input.nextModuleId !== null ? rankById.get(input.nextModuleId) : undefined;

  let rank: number;
  if (prevRank !== undefined && nextRank !== undefined)
    rank = (prevRank + nextRank) / 2;
  else if (nextRank !== undefined) rank = nextRank / 2;
  else if (prevRank !== undefined) rank = prevRank + 1;
  // Unreachable: neighbourIds.length === 0 already returned above.
  else return null;

  const [updated] = await db
    .update(disciplineModulesTable)
    .set({ rank: String(rank), updatedAt: sql`now()` })
    .where(eq(disciplineModulesTable.id, input.moduleId))
    .returning({
      id: disciplineModulesTable.id,
      rank: disciplineModulesTable.rank,
    });
  if (!updated) return null;
  return { id: updated.id, rank: Number(updated.rank) };
}

export async function countLessonsInDisciplineModule(
  id: number,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lessonsTable)
    .where(eq(lessonsTable.disciplineModuleId, id));
  return Number(row?.n ?? 0);
}

/**
 * Delete the module ROW. Its lessons are not touched by this function at
 * all — the foreign key's `on delete set null` returns them to their
 * discipline's Untitled group. The count is what the confirm dialog quotes.
 */
export async function deleteDisciplineModule(
  id: number,
): Promise<
  { ok: true; lessonsReturned: number } | { ok: false; reason: 'not-found' }
> {
  const lessonsReturned = await countLessonsInDisciplineModule(id);
  const deleted = await db
    .delete(disciplineModulesTable)
    .where(eq(disciplineModulesTable.id, id))
    .returning({ id: disciplineModulesTable.id });
  if (deleted.length === 0) return { ok: false, reason: 'not-found' };
  return { ok: true, lessonsReturned };
}

export type PlaceLessonResult =
  | { ok: true; rank: number }
  | { ok: false; reason: 'not-found' }
  | {
      ok: false;
      reason: 'wrong-discipline';
      lessonDiscipline: string;
      moduleDiscipline: string;
    };

/**
 * File a lesson: into a module (`disciplineModuleId`) or back to its
 * discipline's Untitled group (`null`), at a midpoint `library_rank`
 * between the named neighbours.
 *
 * The one invariant this feature has — a lesson's module belongs to the
 * lesson's own discipline — is enforced here, the only write that sets the
 * column, by reading both disciplines first and refusing with both names.
 * Neighbour ranks are scoped to the SAME box (module, or Untitled of the
 * same discipline), so a stale neighbour id from elsewhere yields NULL and
 * nothing is written rather than a rank borrowed from another list.
 *
 * A neighbour's `library_rank` is coalesced to 0 — unlike the module
 * neighbour lookup above. A lesson is unranked until it is first dragged
 * (`libraryRank` starts NULL), so a never-dragged neighbour is the day-one
 * norm, not a stale reference: coalescing keeps the midpoint arithmetic
 * working instead of nulling it out on the very first drag in a box.
 */
export async function placeLessonInLibrary(input: {
  lessonId: number;
  disciplineModuleId: number | null;
  prevLessonId: number | null;
  nextLessonId: number | null;
}): Promise<PlaceLessonResult> {
  const [lesson] = await db
    .select({
      disciplineId: lessonsTable.disciplineId,
      disciplineName: disciplinesTable.name,
    })
    .from(lessonsTable)
    .leftJoin(
      disciplinesTable,
      eq(disciplinesTable.id, lessonsTable.disciplineId),
    )
    .where(eq(lessonsTable.id, input.lessonId));
  if (!lesson) return { ok: false, reason: 'not-found' };

  if (input.disciplineModuleId !== null) {
    const [module] = await db
      .select({
        disciplineId: disciplineModulesTable.disciplineId,
        disciplineName: disciplinesTable.name,
      })
      .from(disciplineModulesTable)
      .innerJoin(
        disciplinesTable,
        eq(disciplinesTable.id, disciplineModulesTable.disciplineId),
      )
      .where(eq(disciplineModulesTable.id, input.disciplineModuleId));
    if (!module) return { ok: false, reason: 'not-found' };
    if (module.disciplineId !== lesson.disciplineId) {
      return {
        ok: false,
        reason: 'wrong-discipline',
        lessonDiscipline: lesson.disciplineName ?? 'Untitled',
        moduleDiscipline: module.disciplineName,
      };
    }
  }

  // Neighbours live in the SAME box as the destination.
  const inBox =
    input.disciplineModuleId === null
      ? sql`${lessonsTable.disciplineModuleId} is null and ${lessonsTable.disciplineId} = ${lesson.disciplineId}`
      : sql`${lessonsTable.disciplineModuleId} = ${input.disciplineModuleId}`;
  const rankOf = (id: number) =>
    sql`coalesce((select ${lessonsTable.libraryRank} from ${lessonsTable} where ${lessonsTable.id} = ${id} and ${inBox}), 0)`;
  const prev = input.prevLessonId ? rankOf(input.prevLessonId) : null;
  const next = input.nextLessonId ? rankOf(input.nextLessonId) : null;
  let rankExpr: SQL;
  if (prev && next) rankExpr = sql`(${prev} + ${next}) / 2`;
  else if (next) rankExpr = sql`${next} / 2`;
  else if (prev) rankExpr = sql`${prev} + 1`;
  // An empty box: rank 1.
  else rankExpr = sql`1`;

  const [updated] = await db
    .update(lessonsTable)
    .set({
      disciplineModuleId: input.disciplineModuleId,
      libraryRank: rankExpr,
      updatedAt: sql`now()`,
    })
    .where(eq(lessonsTable.id, input.lessonId))
    .returning({ id: lessonsTable.id, libraryRank: lessonsTable.libraryRank });
  if (!updated) return { ok: false, reason: 'not-found' };
  return { ok: true, rank: Number(updated.libraryRank) };
}
