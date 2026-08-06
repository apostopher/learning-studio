import { and, eq } from 'drizzle-orm';
import { db } from '#/db';
import { courseOrgsTable, coursesTable, personaTable } from '#/db/schema';
import type { Persona } from '#/types';

/**
 * Link a course to an org, if it isn't already. Called when a course is
 * created, so "the org this deployment administers" always owns what it
 * creates and the AI-training modal always has a row to store a persona
 * selection in.
 */
export async function linkCourseToOrg(
  courseId: number,
  orgId: number,
): Promise<void> {
  await db
    .insert(courseOrgsTable)
    .values({ courseId, orgId })
    .onConflictDoNothing({
      target: [courseOrgsTable.courseId, courseOrgsTable.orgId],
    });
}

export type CoursePersonaSelection = {
  /** False when the course isn't a member of this org at all. */
  linked: boolean;
  /** NULL means "no override" — the org default applies. */
  personaId: number | null;
};

/** What persona, if any, this course is pinned to for this org. */
export async function getCoursePersonaSelection(
  courseId: number,
  orgId: number,
): Promise<CoursePersonaSelection> {
  const [row] = await db
    .select({ personaId: courseOrgsTable.personaId })
    .from(courseOrgsTable)
    .where(
      and(
        eq(courseOrgsTable.courseId, courseId),
        eq(courseOrgsTable.orgId, orgId),
      ),
    )
    .limit(1);
  return row
    ? { linked: true, personaId: row.personaId }
    : { linked: false, personaId: null };
}

/**
 * Pin this course to a persona for this org, or clear the pin with `null` so
 * it follows the org default again.
 *
 * Updates rather than upserts: a missing row means the course isn't in this
 * org, and joining an org is not something choosing a persona should do as a
 * side effect.
 */
export async function setCoursePersona(
  courseId: number,
  orgId: number,
  personaId: number | null,
): Promise<
  | { ok: true }
  | { ok: false; reason: 'not-linked' | 'unpublished' | 'not-found' }
> {
  if (personaId !== null) {
    const [persona] = await db
      .select({
        id: personaTable.id,
        content: personaTable.content,
      })
      .from(personaTable)
      // Scoped to the same org: a course can never be pinned to another
      // org's persona, whatever id is posted.
      .where(and(eq(personaTable.id, personaId), eq(personaTable.orgId, orgId)))
      .limit(1);
    if (!persona) return { ok: false, reason: 'not-found' };
    const hasContent = Object.values(persona.content).some((value) =>
      Array.isArray(value)
        ? value.length > 0
        : String(value ?? '').trim() !== '',
    );
    if (!hasContent) return { ok: false, reason: 'unpublished' };
  }

  const updated = await db
    .update(courseOrgsTable)
    .set({ personaId, updatedAt: new Date() })
    .where(
      and(
        eq(courseOrgsTable.courseId, courseId),
        eq(courseOrgsTable.orgId, orgId),
      ),
    )
    .returning({ id: courseOrgsTable.id });

  return updated.length > 0
    ? { ok: true }
    : { ok: false, reason: 'not-linked' };
}

export type ResolvedPersona = {
  content: Persona;
  /** Which rung of the chain answered — surfaced in the admin UI. */
  source: 'course' | 'org-default';
};

/**
 * Resolve the persona for a chat turn:
 *
 *   `course_orgs.personaId` → `orgs.defaultPersonaId` → null
 *
 * A null result is normal, not an error: `viper7.ts` falls back per-field to
 * its built-in defaults, which is exactly the behaviour of a deployment that
 * has never configured a persona.
 *
 * Reads `content` only. `draftContent` must never reach a prompt — that
 * separation is the entire reason the draft column exists.
 */
export async function resolvePersonaForChat(options: {
  orgId: number;
  courseSlug?: string;
}): Promise<ResolvedPersona | null> {
  const { orgId, courseSlug } = options;

  if (courseSlug) {
    const [row] = await db
      .select({ content: personaTable.content })
      .from(courseOrgsTable)
      .innerJoin(coursesTable, eq(courseOrgsTable.courseId, coursesTable.id))
      .innerJoin(personaTable, eq(courseOrgsTable.personaId, personaTable.id))
      .where(
        and(
          eq(coursesTable.slug, courseSlug),
          eq(courseOrgsTable.orgId, orgId),
        ),
      )
      .limit(1);
    if (row) return { content: row.content, source: 'course' };
  }

  const [fallback] = await db
    .select({ content: personaTable.content })
    .from(personaTable)
    .where(
      and(eq(personaTable.orgId, orgId), eq(personaTable.isOrgDefault, true)),
    )
    .limit(1);

  return fallback ? { content: fallback.content, source: 'org-default' } : null;
}
