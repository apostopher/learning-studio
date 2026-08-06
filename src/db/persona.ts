import { and, asc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '#/db';
import { courseOrgsTable, coursesTable, personaTable } from '#/db/schema';
import type { Persona } from '#/types';

/** A persona row as the admin UI needs it — content plus draft state. */
export type PersonaRecord = {
  id: number;
  name: string;
  content: Persona;
  /** Staged, unpublished edits. `null` means "no unpublished changes". */
  draftContent: Persona | null;
  /**
   * False until `content` has been published at least once. An unpublished
   * persona contributes nothing to a prompt, so the UI refuses to let one be
   * assigned to a course or made the org default.
   */
  isPublished: boolean;
  /** This org's fallback persona, used when a course has no override. */
  isOrgDefault: boolean;
  updatedAt: Date;
};

/**
 * `content` starts as an empty object and is only ever filled by a publish, so
 * "has been published" is simply "content has at least one non-empty field".
 * Deriving it beats a `publishedAt` column that could drift out of step with
 * the content it describes.
 */
function isPublished(content: Persona): boolean {
  return Object.values(content).some((value) =>
    Array.isArray(value) ? value.length > 0 : String(value ?? '').trim() !== '',
  );
}

function toRecord(row: {
  id: number;
  name: string;
  content: Persona;
  draftContent: Persona | null;
  isOrgDefault: boolean;
  updatedAt: Date;
}): PersonaRecord {
  return { ...row, isPublished: isPublished(row.content) };
}

const personaColumns = {
  id: personaTable.id,
  name: personaTable.name,
  content: personaTable.content,
  draftContent: personaTable.draftContent,
  isOrgDefault: personaTable.isOrgDefault,
  updatedAt: personaTable.updatedAt,
};

/** Every persona belonging to one org, oldest first. */
export async function listPersonas(orgId: number): Promise<PersonaRecord[]> {
  const rows = await db
    .select(personaColumns)
    .from(personaTable)
    .where(eq(personaTable.orgId, orgId))
    .orderBy(asc(personaTable.id));
  return rows.map(toRecord);
}

/** One persona, scoped to its org so an id from another org can't be read. */
export async function getPersonaById(
  orgId: number,
  personaId: number,
): Promise<PersonaRecord | null> {
  const [row] = await db
    .select(personaColumns)
    .from(personaTable)
    .where(and(eq(personaTable.orgId, orgId), eq(personaTable.id, personaId)))
    .limit(1);
  return row ? toRecord(row) : null;
}

const EMPTY_CONTENT: Persona = {
  basicInfo: '',
  mission: '',
  goal: '',
  communicationStyle: '',
  quotes: [],
  coreDirective: '',
  howToAnswer: '',
};

export type PersonaWriteResult =
  | { ok: true; persona: PersonaRecord }
  | { ok: false; reason: 'duplicate-name' }
  | { ok: false; reason: 'not-found' };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

/**
 * Create an empty persona. Content is filled in afterwards by the editor's
 * autosave (into `draftContent`) and a publish — so a new persona is
 * deliberately unpublished and unassignable until its author says otherwise.
 */
export async function createPersona(
  orgId: number,
  name: string,
): Promise<PersonaWriteResult> {
  try {
    const [row] = await db
      .insert(personaTable)
      .values({ orgId, name, content: EMPTY_CONTENT })
      .returning(personaColumns);
    return { ok: true, persona: toRecord(row) };
  } catch (error) {
    if (isUniqueViolation(error))
      return { ok: false, reason: 'duplicate-name' };
    throw error;
  }
}

/** Rename. Saved live on blur — the name is a label the prompt never reads. */
export async function renamePersona(
  orgId: number,
  personaId: number,
  name: string,
): Promise<PersonaWriteResult> {
  try {
    const [row] = await db
      .update(personaTable)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(personaTable.orgId, orgId), eq(personaTable.id, personaId)))
      .returning(personaColumns);
    return row
      ? { ok: true, persona: toRecord(row) }
      : { ok: false, reason: 'not-found' };
  } catch (error) {
    if (isUniqueViolation(error))
      return { ok: false, reason: 'duplicate-name' };
    throw error;
  }
}

/**
 * Autosave target. Writes only to `draftContent`, never `content`, so nothing
 * typed here can reach a live system prompt before an explicit publish.
 *
 * Returns the row so callers can tell a real save from a no-op; the beacon
 * path ignores it, since a beacon response is unreadable by design.
 */
export async function savePersonaDraft(
  orgId: number,
  personaId: number,
  draft: Persona,
): Promise<PersonaRecord | null> {
  const [row] = await db
    .update(personaTable)
    .set({ draftContent: draft, updatedAt: new Date() })
    .where(and(eq(personaTable.orgId, orgId), eq(personaTable.id, personaId)))
    .returning(personaColumns);
  return row ? toRecord(row) : null;
}

/** Throw the draft away and go back to whatever is published. */
export async function discardPersonaDraft(
  orgId: number,
  personaId: number,
): Promise<PersonaRecord | null> {
  const [row] = await db
    .update(personaTable)
    .set({ draftContent: null, updatedAt: new Date() })
    .where(and(eq(personaTable.orgId, orgId), eq(personaTable.id, personaId)))
    .returning(personaColumns);
  return row ? toRecord(row) : null;
}

/**
 * Copy the draft into `content` and clear it, in one statement so the two can
 * never disagree. Clearing is what makes `draftContent IS NOT NULL` a reliable
 * "has unpublished changes" predicate everywhere else.
 *
 * A row with no draft is left untouched — publishing nothing is a no-op, not
 * an error, and the UI disables the button in that state anyway.
 */
export async function publishPersona(
  orgId: number,
  personaId: number,
): Promise<PersonaRecord | null> {
  const [row] = await db
    .update(personaTable)
    .set({
      content: sql`${personaTable.draftContent}`,
      draftContent: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(personaTable.orgId, orgId),
        eq(personaTable.id, personaId),
        isNotNull(personaTable.draftContent),
      ),
    )
    .returning(personaColumns);
  // No draft to publish: report the row as it stands rather than "not found".
  return row ? toRecord(row) : getPersonaById(orgId, personaId);
}

/**
 * Course names keyed by the persona they use, for the whole org.
 *
 * Fetched with the list rather than on demand so the delete confirm can name
 * the affected courses without a round trip at the moment of confirming — the
 * point of that dialog is that the consequence is visible *before* the click.
 */
export async function listPersonaUsage(
  orgId: number,
): Promise<Record<number, string[]>> {
  const rows = await db
    .select({
      personaId: courseOrgsTable.personaId,
      courseName: coursesTable.name,
    })
    .from(courseOrgsTable)
    .innerJoin(coursesTable, eq(courseOrgsTable.courseId, coursesTable.id))
    .where(
      and(
        eq(courseOrgsTable.orgId, orgId),
        isNotNull(courseOrgsTable.personaId),
      ),
    )
    .orderBy(asc(coursesTable.name));

  const usage: Record<number, string[]> = {};
  for (const row of rows) {
    if (row.personaId === null) continue;
    const names = usage[row.personaId] ?? [];
    names.push(row.courseName);
    usage[row.personaId] = names;
  }
  return usage;
}

/** Courses in this org that would lose their persona if `personaId` went. */
export async function listCoursesUsingPersona(
  orgId: number,
  personaId: number,
): Promise<{ id: number; name: string }[]> {
  return db
    .select({ id: coursesTable.id, name: coursesTable.name })
    .from(courseOrgsTable)
    .innerJoin(coursesTable, eq(courseOrgsTable.courseId, coursesTable.id))
    .where(
      and(
        eq(courseOrgsTable.orgId, orgId),
        eq(courseOrgsTable.personaId, personaId),
      ),
    )
    .orderBy(asc(coursesTable.name));
}

/**
 * Delete. `course_orgs.personaId` is `onDelete: 'set null'` and the org
 * default is a flag on this same row, so affected courses fall back down the
 * resolution chain rather than the delete being blocked. The confirm dialog
 * names them first — see `listCoursesUsingPersona`.
 */
export async function deletePersona(
  orgId: number,
  personaId: number,
): Promise<boolean> {
  const deleted = await db
    .delete(personaTable)
    .where(and(eq(personaTable.orgId, orgId), eq(personaTable.id, personaId)))
    .returning({ id: personaTable.id });
  return deleted.length > 0;
}

/**
 * Set (or clear, with `null`) the org's fallback persona.
 *
 * Refuses an unpublished persona: assigning one would resolve to empty content
 * and silently fall through to the prompt's built-in defaults, which is
 * indistinguishable from a bug.
 *
 * Clearing the old default and setting the new one run in one transaction —
 * the partial unique index would otherwise reject the second write while the
 * first still holds the flag.
 */
export async function setOrgDefaultPersona(
  orgId: number,
  personaId: number | null,
): Promise<{ ok: true } | { ok: false; reason: 'not-found' | 'unpublished' }> {
  if (personaId !== null) {
    const persona = await getPersonaById(orgId, personaId);
    if (!persona) return { ok: false, reason: 'not-found' };
    if (!persona.isPublished) return { ok: false, reason: 'unpublished' };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(personaTable)
      .set({ isOrgDefault: false })
      .where(
        and(
          eq(personaTable.orgId, orgId),
          eq(personaTable.isOrgDefault, true),
          ...(personaId === null ? [] : [ne(personaTable.id, personaId)]),
        ),
      );
    if (personaId !== null) {
      await tx
        .update(personaTable)
        .set({ isOrgDefault: true, updatedAt: new Date() })
        .where(
          and(eq(personaTable.orgId, orgId), eq(personaTable.id, personaId)),
        );
    }
  });

  return { ok: true };
}
