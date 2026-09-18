import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '#/db';
import {
  courseOrgsTable,
  courseVideoProvidersTable,
  lessonsTable,
} from '#/db/schema';
import { decryptJson, type SecretEnvelope } from '#/lib/crypto.server';
import { buildLessonPosters } from '#/lib/video-providers/posters.server';
import type { ProviderId } from '#/lib/video-providers/types';

/**
 * Provider credentials for the LIBRARY, which has none of its own: keys live
 * on courses. The first course in the org with that provider connected lends
 * its key — in practice every course shares one Synthesia account — and its
 * id comes back with it so the thumbnail sweep is cached under that course
 * rather than swept a second time for the shelf (`getVideoThumbnailsWithCache`
 * is keyed on a course id so the key itself never reaches Redis).
 *
 * Deterministic (lowest course id) so a cache warmed by one column is the
 * one every other column reads.
 */
export async function resolveOrgProvider(
  orgId: number,
  provider: ProviderId,
): Promise<{ courseId: number; creds: unknown } | null> {
  const [row] = await db
    .select({
      courseId: courseVideoProvidersTable.courseId,
      secrets: courseVideoProvidersTable.secrets,
    })
    .from(courseVideoProvidersTable)
    .innerJoin(
      courseOrgsTable,
      eq(courseOrgsTable.courseId, courseVideoProvidersTable.courseId),
    )
    .where(
      and(
        eq(courseOrgsTable.orgId, orgId),
        eq(courseVideoProvidersTable.provider, provider),
      ),
    )
    .orderBy(asc(courseVideoProvidersTable.courseId))
    .limit(1);
  if (!row) return null;
  return {
    courseId: row.courseId,
    creds: decryptJson(row.secrets as SecretEnvelope),
  };
}

/**
 * Poster frames for every lesson on one discipline's shelf (its modules and
 * its own Untitled group alike), or — with `disciplineId: null` — for the
 * org-level Untitled bag, as `lessonId → url`. Lessons with no poster are
 * absent, exactly as `getCourseLessonPosters` answers for a board.
 *
 * A lesson whose provider no course in the org has connected simply gets no
 * poster: the tile falls back to its grey placeholder, the same as a board
 * whose course lacks the key.
 */
export async function getDisciplineLessonPosters(
  orgId: number,
  disciplineId: number | null,
): Promise<Record<number, string>> {
  const rows = await db
    .select({
      id: lessonsTable.id,
      provider: lessonsTable.videoProvider,
      ref: lessonsTable.videoRef,
    })
    .from(lessonsTable)
    .where(
      and(
        eq(lessonsTable.orgId, orgId),
        disciplineId === null
          ? isNull(lessonsTable.disciplineId)
          : eq(lessonsTable.disciplineId, disciplineId),
        isNotNull(lessonsTable.videoProvider),
        isNotNull(lessonsTable.videoRef),
      ),
    );
  const lessons = rows.flatMap((row) =>
    row.provider && row.ref
      ? [{ id: row.id, provider: row.provider as ProviderId, ref: row.ref }]
      : [],
  );
  if (lessons.length === 0) return {};

  // Resolved once, up front, because the builder needs the lender's id for
  // the Synthesia cache key before it asks for the key itself.
  const synthesia = lessons.some((l) => l.provider === 'synthesia')
    ? await resolveOrgProvider(orgId, 'synthesia')
    : null;
  return buildLessonPosters({
    courseId: synthesia?.courseId ?? 0,
    lessons,
    loadCredentials: async (provider) => {
      if (provider === 'synthesia') return synthesia?.creds ?? null;
      return (await resolveOrgProvider(orgId, provider))?.creds ?? null;
    },
  });
}
