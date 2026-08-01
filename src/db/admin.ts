import { del, list } from '@vercel/blob';
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  inArray,
  like,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { getCourseDetailsWithCache } from '#/db/course';
import {
  getCourseSlugForCourseId,
  getCourseSlugForLessonId,
  getCourseSlugForModuleId,
} from '#/db/lesson-access';
import { getLessonPlayback } from '#/db/lesson-playback';
import type { DBCourse } from '#/db/schema';
import {
  coursesTable,
  courseVideoProvidersTable,
  lessonDependenciesTable,
  lessonsTable,
  moduleDependenciesTable,
  modulesTable,
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
  videoProgressTable,
} from '#/db/schema';
import { env } from '#/env';
import type {
  AdminCourseSummary,
  BoardLesson,
  BoardModule,
  CourseBoard,
  CreateCourseInput,
  CredentialSummary,
  SaveCredentialInput,
  UpdateCourseInput,
} from '#/lib/admin-schemas';
import { watchedMilestones } from '#/lib/course-milestones';
import {
  decryptJson,
  encryptJson,
  type SecretEnvelope,
} from '#/lib/crypto.server';
import { cyclicPrerequisites } from '#/lib/module-dependency-graph';
import { slugify } from '#/lib/slugify';
import { type ProviderId, VIDEO_PROVIDERS } from '#/lib/video-providers';
import {
  type PlaybackResult,
  resolvePlayback,
  validateCredentials,
} from '#/lib/video-providers/resolve.server';
import type { OnboardingQuestions, SubscriptionType } from '#/types';
import { db } from '.';

// re-export so existing importers of AdminCourseSummary from "@/db/admin" keep working
export type { AdminCourseSummary } from '#/lib/admin-schemas';

/**
 * Evict the learner-facing `getCourseDetailsWithCache` entry for a course so
 * an admin save is visible immediately instead of waiting out the 6h TTL.
 *
 * Best-effort, same pattern as `deleteBlobs`/`deleteOrphanedBlob` elsewhere:
 * a Redis outage must not turn a successful admin write into a failed
 * response, so failures are logged and swallowed rather than thrown. `slug`
 * is `null` when the owning course couldn't be resolved (e.g. a dangling
 * id) — nothing to invalidate in that case.
 */
async function invalidateCourseDetailsCache(
  slug: string | null,
): Promise<void> {
  if (!slug) return;
  try {
    await getCourseDetailsWithCache.invalidate(slug);
  } catch (error) {
    console.error('Failed to invalidate course-details cache:', error);
  }
}

/**
 * Evict the learner-facing `getLessonPlayback` cache entry for a lesson so an
 * admin's video swap is visible immediately instead of serving the PREVIOUS
 * video's still-validly-signed URL until it expires (up to ~59.5m for Mux —
 * see `getLessonPlayback`'s doc comment for the TTL math). A stale-but-
 * validly-signed URL plays fine, so the player's 401/403 recovery path never
 * fires and nothing else recovers on its own.
 *
 * Best-effort, same pattern as `invalidateCourseDetailsCache`: a Redis outage
 * must not turn a successful admin write into a failed response.
 */
async function invalidateLessonPlaybackCache(
  lessonSlug: string | null,
): Promise<void> {
  if (!lessonSlug) return;
  try {
    await getLessonPlayback.invalidate(lessonSlug);
  } catch (error) {
    console.error('Failed to invalidate lesson-playback cache:', error);
  }
}

/** All courses with their module and lesson counts, newest-updated first. */
export async function listAdminCourses(): Promise<AdminCourseSummary[]> {
  const rows = await db
    .select({
      id: coursesTable.id,
      name: coursesTable.name,
      slug: coursesTable.slug,
      imageUrlAvif: coursesTable.imageUrlAvif,
      imageUrlWebp: coursesTable.imageUrlWebp,
      updatedAt: coursesTable.updatedAt,
      moduleCount: sql<number>`count(distinct ${modulesTable.id})`,
      lessonCount: sql<number>`count(distinct ${lessonsTable.id})`,
    })
    .from(coursesTable)
    .leftJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))
    .leftJoin(lessonsTable, eq(lessonsTable.moduleId, modulesTable.id))
    .groupBy(coursesTable.id)
    .orderBy(desc(coursesTable.updatedAt), desc(coursesTable.id));

  // Postgres count() comes back as a string via node-postgres; normalise to number.
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    imageUrlAvif: r.imageUrlAvif,
    imageUrlWebp: r.imageUrlWebp,
    updatedAt: r.updatedAt,
    moduleCount: Number(r.moduleCount),
    lessonCount: Number(r.lessonCount),
  }));
}

/** Role names assigned to the auth user (empty if no profile or no roles). */
export async function getUserRoleNames(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: userRolesTable.name })
    .from(userProfileTable)
    .innerJoin(
      userProfileRolesTable,
      eq(userProfileRolesTable.userProfileId, userProfileTable.id),
    )
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, userProfileRolesTable.roleId),
    )
    .where(eq(userProfileTable.userId, userId));

  return rows.map((r) => r.name);
}

export async function createCourse(
  input: CreateCourseInput,
): Promise<DBCourse> {
  const base = slugify(input.name) || 'course';

  // Find a free slug: base, else base-2, base-3, ...
  const taken = await db
    .select({ slug: coursesTable.slug })
    .from(coursesTable)
    .where(
      or(eq(coursesTable.slug, base), like(coursesTable.slug, `${base}-%`)),
    );
  const takenSet = new Set(taken.map((r) => r.slug));
  let slug = base;
  for (let n = 2; takenSet.has(slug); n++) slug = `${base}-${n}`;

  const [created] = await db
    .insert(coursesTable)
    .values({
      name: input.name,
      slug,
      description: input.description ?? null,
      imageUrlAvif: input.imageUrlAvif ?? null,
      imageUrlWebp: input.imageUrlWebp ?? null,
    })
    .returning();

  // A "fresh" slug isn't guaranteed cache-free: deleteCourse invalidates on
  // delete, but if an admin session reads /api/course/details for that slug
  // in the window between the delete and this create, getCourseDetailsWithCache
  // caches the `null` result for the full TTL (cacheWithRedis has no
  // if(result) guard — it caches misses same as hits). A same-named recreate
  // then hands the freed slug straight back here, and without this call the
  // new course would be invisible behind that cached null for up to 6h.
  await invalidateCourseDetailsCache(created.slug);

  return created;
}

export async function createModule(input: {
  courseId: number;
  name: string;
  imageUrlAvif?: string | null;
  imageUrlWebp?: string | null;
}): Promise<BoardModule> {
  const base = slugify(input.name) || 'module';
  const taken = await db
    .select({ slug: modulesTable.slug })
    .from(modulesTable)
    .where(
      or(eq(modulesTable.slug, base), like(modulesTable.slug, `${base}-%`)),
    );
  const takenSet = new Set(taken.map((r) => r.slug));
  let slug = base;
  for (let n = 2; takenSet.has(slug); n++) slug = `${base}-${n}`;

  const [{ maxRank }] = await db
    .select({ maxRank: sql<string | null>`max(${modulesTable.rank})` })
    .from(modulesTable)
    .where(eq(modulesTable.courseId, input.courseId));
  const rank = maxRank === null ? 1 : Number(maxRank) + 1;

  const [created] = await db
    .insert(modulesTable)
    .values({
      courseId: input.courseId,
      name: input.name,
      slug,
      imageUrlAvif: input.imageUrlAvif ?? null,
      imageUrlWebp: input.imageUrlWebp ?? null,
      requiredSubscriptions: [],
      rank: String(rank),
    })
    .returning();

  await invalidateCourseDetailsCache(
    await getCourseSlugForCourseId(input.courseId),
  );

  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    imageUrlAvif: created.imageUrlAvif,
    imageUrlWebp: created.imageUrlWebp,
    rank: Number(created.rank),
    requiredSubscriptions: created.requiredSubscriptions as SubscriptionType[],
    sequentialLessons: created.sequentialLessons,
    // A module is created with no prerequisites and no learners by definition.
    dependsOn: [],
    learnerCount: 0,
    lessons: [],
  };
}

export async function createLesson(input: {
  moduleId: number;
  name: string;
}): Promise<BoardLesson> {
  const base = slugify(input.name) || 'lesson';
  const taken = await db
    .select({ slug: lessonsTable.slug })
    .from(lessonsTable)
    .where(
      or(eq(lessonsTable.slug, base), like(lessonsTable.slug, `${base}-%`)),
    );
  const takenSet = new Set(taken.map((r) => r.slug));
  let slug = base;
  for (let n = 2; takenSet.has(slug); n++) slug = `${base}-${n}`;

  const [{ maxRank }] = await db
    .select({ maxRank: sql<string | null>`max(${lessonsTable.rank})` })
    .from(lessonsTable)
    .where(eq(lessonsTable.moduleId, input.moduleId));
  const rank = maxRank === null ? 1 : Number(maxRank) + 1;

  const [created] = await db
    .insert(lessonsTable)
    .values({
      moduleId: input.moduleId,
      name: input.name,
      slug,
      requiredSubscriptions: [],
      rank: String(rank),
    })
    .returning();

  await invalidateCourseDetailsCache(
    await getCourseSlugForModuleId(input.moduleId),
  );

  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    rank: Number(created.rank),
    isAvailable: created.isAvailable,
    hasDebrief: created.hasDebrief,
    needsVideoWatch: created.needsVideoWatch,
    requiredSubscriptions: created.requiredSubscriptions as SubscriptionType[],
    isConfigured: created.videoRef !== null,
    // A lesson is created before any material exists, so it has no quiz yet.
    quizQuestionCount: 0,
    // No explicit prerequisites, so it joins its module's chain (if any).
    dependsOn: [],
    videoProvider: created.videoProvider as ProviderId | null,
    videoRef: created.videoRef,
  };
}

/**
 * Distinct learners with watch progress in each of `moduleIds`.
 *
 * Surfaced beside the dependency picker: adding a prerequisite locks these
 * people out mid-module on their next page load, with no grandfathering, so
 * the count has to be on screen while the decision is made.
 *
 * Joined directly on `videos_progress.lesson_id = lessons.id` — both
 * integers, no cast needed now that progress is keyed on lesson id rather
 * than the Synthesia video id. Only modules with progress appear in the
 * result; callers default the rest to zero.
 */
async function countLearnersByModule(
  moduleIds: number[],
): Promise<Map<number, number>> {
  const rows = await db
    .select({
      moduleId: lessonsTable.moduleId,
      learners: countDistinct(videoProgressTable.userId),
    })
    .from(lessonsTable)
    .innerJoin(
      videoProgressTable,
      and(
        eq(videoProgressTable.lessonId, lessonsTable.id),
        inArray(videoProgressTable.progress, watchedMilestones),
      ),
    )
    .where(inArray(lessonsTable.moduleId, moduleIds))
    .groupBy(lessonsTable.moduleId);

  return new Map(rows.map((r) => [r.moduleId, Number(r.learners)]));
}

export async function getCourseBoard(
  courseId: number,
): Promise<CourseBoard | null> {
  const [course] = await db
    .select({
      id: coursesTable.id,
      name: coursesTable.name,
      slug: coursesTable.slug,
      description: coursesTable.description,
      imageUrlAvif: coursesTable.imageUrlAvif,
      imageUrlWebp: coursesTable.imageUrlWebp,
    })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));
  if (!course) return null;

  const modules = await db
    .select({
      id: modulesTable.id,
      name: modulesTable.name,
      slug: modulesTable.slug,
      imageUrlAvif: modulesTable.imageUrlAvif,
      imageUrlWebp: modulesTable.imageUrlWebp,
      rank: modulesTable.rank,
      requiredSubscriptions: modulesTable.requiredSubscriptions,
      sequentialLessons: modulesTable.sequentialLessons,
    })
    .from(modulesTable)
    .where(eq(modulesTable.courseId, courseId))
    .orderBy(asc(modulesTable.rank), asc(modulesTable.id));

  const moduleIds = modules.map((m) => m.id);
  const lessons = moduleIds.length
    ? await db
        .select({
          id: lessonsTable.id,
          moduleId: lessonsTable.moduleId,
          name: lessonsTable.name,
          slug: lessonsTable.slug,
          rank: lessonsTable.rank,
          isAvailable: lessonsTable.isAvailable,
          hasDebrief: lessonsTable.hasDebrief,
          needsVideoWatch: lessonsTable.needsVideoWatch,
          requiredSubscriptions: lessonsTable.requiredSubscriptions,
          videoProvider: lessonsTable.videoProvider,
          videoRef: lessonsTable.videoRef,
          // Scalar subquery, not a join: `lesson_material.lesson_slug` carries
          // only a plain index, so a duplicate row there would multiply this
          // ungrouped query and show the same lesson twice on the board.
          quizQuestionCount: sql<number>`coalesce((
            select json_array_length(m.quiz) from lesson_material m
            where m.lesson_slug = ${lessonsTable.slug} limit 1
          ), 0)`,
        })
        .from(lessonsTable)
        .where(inArray(lessonsTable.moduleId, moduleIds))
        .orderBy(asc(lessonsTable.rank), asc(lessonsTable.id))
    : [];

  const byModule = new Map<number, typeof lessons>();
  for (const lesson of lessons) {
    const list = byModule.get(lesson.moduleId) ?? [];
    list.push(lesson);
    byModule.set(lesson.moduleId, list);
  }

  const lessonIds = lessons.map((l) => l.id);
  const [dependencies, learnerCounts, lessonDependencies] = moduleIds.length
    ? await Promise.all([
        db
          .select({
            moduleId: moduleDependenciesTable.moduleId,
            dependsOn: moduleDependenciesTable.dependsOn,
          })
          .from(moduleDependenciesTable)
          .where(inArray(moduleDependenciesTable.moduleId, moduleIds)),
        countLearnersByModule(moduleIds),
        lessonIds.length
          ? db
              .select({
                lessonId: lessonDependenciesTable.lessonId,
                dependsOn: lessonDependenciesTable.dependsOn,
              })
              .from(lessonDependenciesTable)
              .where(inArray(lessonDependenciesTable.lessonId, lessonIds))
          : Promise.resolve([]),
      ])
    : [[], new Map<number, number>(), []];

  const dependsOnByModule = new Map(
    dependencies.map((d) => [d.moduleId, d.dependsOn]),
  );
  const dependsOnByLesson = new Map(
    lessonDependencies.map((d) => [d.lessonId, d.dependsOn]),
  );

  return {
    course,
    modules: modules.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      imageUrlAvif: m.imageUrlAvif,
      imageUrlWebp: m.imageUrlWebp,
      rank: Number(m.rank),
      requiredSubscriptions: m.requiredSubscriptions as SubscriptionType[],
      dependsOn: dependsOnByModule.get(m.id) ?? [],
      sequentialLessons: m.sequentialLessons,
      learnerCount: learnerCounts.get(m.id) ?? 0,
      lessons: (byModule.get(m.id) ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        rank: Number(l.rank),
        isAvailable: l.isAvailable,
        hasDebrief: l.hasDebrief,
        needsVideoWatch: l.needsVideoWatch,
        requiredSubscriptions: l.requiredSubscriptions as SubscriptionType[],
        isConfigured: l.videoRef !== null,
        quizQuestionCount: Number(l.quizQuestionCount),
        dependsOn: dependsOnByLesson.get(l.id) ?? [],
        videoProvider: l.videoProvider as ProviderId | null,
        videoRef: l.videoRef,
      })),
    })),
  };
}

/** Configured video-provider credentials for a course, decrypted display only. */
export async function listCourseProviders(
  courseId: number,
): Promise<CredentialSummary[]> {
  const rows = await db
    .select({
      provider: courseVideoProvidersTable.provider,
      secrets: courseVideoProvidersTable.secrets,
      lastValidatedAt: courseVideoProvidersTable.lastValidatedAt,
    })
    .from(courseVideoProvidersTable)
    .where(eq(courseVideoProvidersTable.courseId, courseId));
  return rows.map((r) => {
    const provider = r.provider as ProviderId;
    const creds = decryptJson(r.secrets as SecretEnvelope);
    return {
      provider,
      configured: true as const,
      display: VIDEO_PROVIDERS[provider].credentialDisplay(creds),
      lastValidatedAt: r.lastValidatedAt,
    };
  });
}

/** Validate then upsert encrypted provider credentials for a course. */
export async function saveCourseProvider(
  courseId: number,
  input: SaveCredentialInput,
): Promise<{ ok: boolean; error?: string }> {
  const { provider, ...creds } = input;
  const validation = await validateCredentials(provider, creds);
  if (!validation.ok) return validation;
  const secrets = encryptJson(creds);
  await db
    .insert(courseVideoProvidersTable)
    .values({ courseId, provider, secrets, lastValidatedAt: new Date() })
    .onConflictDoUpdate({
      target: [
        courseVideoProvidersTable.courseId,
        courseVideoProvidersTable.provider,
      ],
      set: { secrets, lastValidatedAt: new Date(), updatedAt: sql`now()` },
    });
  return { ok: true };
}

export async function deleteCourseProvider(
  courseId: number,
  provider: ProviderId,
): Promise<boolean> {
  const [deleted] = await db
    .delete(courseVideoProvidersTable)
    .where(
      and(
        eq(courseVideoProvidersTable.courseId, courseId),
        eq(courseVideoProvidersTable.provider, provider),
      ),
    )
    .returning({ id: courseVideoProvidersTable.id });
  return Boolean(deleted);
}

/** Server-only: decrypted creds for a course+provider, or null. */
export async function resolveCourseProvider(
  courseId: number,
  provider: ProviderId,
): Promise<unknown | null> {
  const [row] = await db
    .select({ secrets: courseVideoProvidersTable.secrets })
    .from(courseVideoProvidersTable)
    .where(
      and(
        eq(courseVideoProvidersTable.courseId, courseId),
        eq(courseVideoProvidersTable.provider, provider),
      ),
    );
  return row ? decryptJson(row.secrets as SecretEnvelope) : null;
}

export async function setLessonVideo(
  lessonId: number,
  provider: ProviderId,
  ref: string,
): Promise<{ id: number } | null> {
  const [updated] = await db
    .update(lessonsTable)
    .set({ videoProvider: provider, videoRef: ref, updatedAt: sql`now()` })
    .where(eq(lessonsTable.id, lessonId))
    .returning({ id: lessonsTable.id, slug: lessonsTable.slug });
  if (!updated) return null;

  await invalidateCourseDetailsCache(await getCourseSlugForLessonId(lessonId));
  // Evicted by slug (not `getCourseSlugForLessonId`'s course slug above) —
  // `getLessonPlayback` is keyed per-lesson, not per-course, so an unrelated
  // course-details invalidation would leave this lesson's stale playback
  // entry untouched.
  await invalidateLessonPlaybackCache(updated.slug);

  return { id: updated.id };
}

export async function resolveLessonPlayback(
  lessonId: number,
): Promise<PlaybackResult | null> {
  const [lesson] = await db
    .select({
      videoProvider: lessonsTable.videoProvider,
      videoRef: lessonsTable.videoRef,
      courseId: modulesTable.courseId,
    })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .where(eq(lessonsTable.id, lessonId));
  if (!lesson?.videoProvider || !lesson.videoRef) return null;
  const provider = lesson.videoProvider as ProviderId;
  const creds = await resolveCourseProvider(lesson.courseId, provider);
  if (!creds) return null;
  return resolvePlayback(provider, lesson.videoRef, creds);
}

export async function reorderModule(input: {
  moduleId: number;
  prevModuleId: number | null;
  nextModuleId: number | null;
}): Promise<{ id: number; rank: number } | null> {
  const prevRank = input.prevModuleId
    ? sql`(select ${modulesTable.rank} from ${modulesTable} where ${modulesTable.id} = ${input.prevModuleId})`
    : null;
  const nextRank = input.nextModuleId
    ? sql`(select ${modulesTable.rank} from ${modulesTable} where ${modulesTable.id} = ${input.nextModuleId})`
    : null;

  let rankExpr: SQL;
  if (prevRank && nextRank) rankExpr = sql`(${prevRank} + ${nextRank}) / 2`;
  else if (nextRank) rankExpr = sql`${nextRank} / 2`;
  else if (prevRank) rankExpr = sql`${prevRank} + 1`;
  else return null;

  const [updated] = await db
    .update(modulesTable)
    .set({ rank: rankExpr, updatedAt: sql`now()` })
    .where(eq(modulesTable.id, input.moduleId))
    .returning({ id: modulesTable.id, rank: modulesTable.rank });
  if (!updated) return null;

  await invalidateCourseDetailsCache(
    await getCourseSlugForModuleId(input.moduleId),
  );

  return { id: updated.id, rank: Number(updated.rank) };
}

/**
 * Move a lesson to a module (same or different) with a midpoint rank computed
 * from its target neighbors. Handles reorder-within-module and cross-module
 * drag uniformly; rank 1 when the target module is empty.
 */
export async function moveLesson(input: {
  lessonId: number;
  targetModuleId: number;
  prevLessonId: number | null;
  nextLessonId: number | null;
}): Promise<{ id: number; rank: number; moduleId: number } | null> {
  const prevRank = input.prevLessonId
    ? sql`(select ${lessonsTable.rank} from ${lessonsTable} where ${lessonsTable.id} = ${input.prevLessonId})`
    : null;
  const nextRank = input.nextLessonId
    ? sql`(select ${lessonsTable.rank} from ${lessonsTable} where ${lessonsTable.id} = ${input.nextLessonId})`
    : null;

  let rankExpr: SQL;
  if (prevRank && nextRank) rankExpr = sql`(${prevRank} + ${nextRank}) / 2`;
  else if (nextRank) rankExpr = sql`${nextRank} / 2`;
  else if (prevRank) rankExpr = sql`${prevRank} + 1`;
  else rankExpr = sql`1`;

  // Resolve the lesson's *current* course before the move — a cross-module
  // drag can also be a cross-course drag, and after the update the lesson's
  // moduleId (and therefore this join) would already point at the target.
  const sourceCourseSlug = await getCourseSlugForLessonId(input.lessonId);

  const [updated] = await db
    .update(lessonsTable)
    .set({
      moduleId: input.targetModuleId,
      rank: rankExpr,
      updatedAt: sql`now()`,
    })
    .where(eq(lessonsTable.id, input.lessonId))
    .returning({
      id: lessonsTable.id,
      rank: lessonsTable.rank,
      moduleId: lessonsTable.moduleId,
    });
  if (!updated) return null;

  const targetCourseSlug = await getCourseSlugForModuleId(input.targetModuleId);
  await invalidateCourseDetailsCache(sourceCourseSlug);
  if (targetCourseSlug !== sourceCourseSlug) {
    await invalidateCourseDetailsCache(targetCourseSlug);
  }

  return {
    id: updated.id,
    rank: Number(updated.rank),
    moduleId: updated.moduleId,
  };
}

export async function updateLessonName(
  lessonId: number,
  name: string,
): Promise<{ id: number; name: string } | null> {
  const [updated] = await db
    .update(lessonsTable)
    .set({ name, updatedAt: sql`now()` })
    .where(eq(lessonsTable.id, lessonId))
    .returning({ id: lessonsTable.id, name: lessonsTable.name });
  if (!updated) return null;

  await invalidateCourseDetailsCache(await getCourseSlugForLessonId(lessonId));

  return updated;
}

export async function updateLessonConfig(
  lessonId: number,
  patch: {
    isAvailable?: boolean;
    hasDebrief?: boolean;
    needsVideoWatch?: boolean;
    requiredSubscriptions?: SubscriptionType[];
  },
): Promise<{
  id: number;
  isAvailable: boolean;
  hasDebrief: boolean;
  needsVideoWatch: boolean;
  requiredSubscriptions: SubscriptionType[];
} | null> {
  const [updated] = await db
    .update(lessonsTable)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(lessonsTable.id, lessonId))
    .returning({
      id: lessonsTable.id,
      isAvailable: lessonsTable.isAvailable,
      hasDebrief: lessonsTable.hasDebrief,
      needsVideoWatch: lessonsTable.needsVideoWatch,
      requiredSubscriptions: lessonsTable.requiredSubscriptions,
    });
  if (!updated) return null;

  await invalidateCourseDetailsCache(await getCourseSlugForLessonId(lessonId));

  return {
    ...updated,
    requiredSubscriptions: updated.requiredSubscriptions as SubscriptionType[],
  };
}

export async function deleteLesson(lessonId: number): Promise<boolean> {
  // Resolve before the delete — once the row is gone, the module/course join
  // used to find the owning slug has nothing to join against.
  const courseSlug = await getCourseSlugForLessonId(lessonId);

  const [deleted] = await db
    .delete(lessonsTable)
    .where(eq(lessonsTable.id, lessonId))
    .returning({ id: lessonsTable.id, slug: lessonsTable.slug });
  if (!deleted) return false;

  // Strip the dead slug from every dependent, exactly as deleteModule does
  // with array_remove. depends_on is JSONB objects rather than a text array,
  // so the equivalent is a filtered re-aggregation. Without this, dependents
  // keep an edge to a lesson that no longer exists: the gate tolerates it
  // (unresolvable edges are skipped) but the admin UI would render a chip for
  // a prerequisite that isn't there, and it accumulates forever.
  await db
    .update(lessonDependenciesTable)
    .set({
      dependsOn: sql`coalesce((
        select jsonb_agg(entry)
        from jsonb_array_elements(${lessonDependenciesTable.dependsOn}) entry
        where entry->>'lessonSlug' <> ${deleted.slug}
      ), '[]'::jsonb)`,
    })
    .where(
      sql`${lessonDependenciesTable.dependsOn} @> ${JSON.stringify([{ lessonSlug: deleted.slug }])}::jsonb`,
    );

  await invalidateCourseDetailsCache(courseSlug);
  return true;
}

export type UpdateLessonDependenciesResult =
  | { ok: true; dependsOn: { lessonSlug: string }[] }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'unknown-lessons'; slugs: string[] };

/**
 * Replace one lesson's explicit prerequisites.
 *
 * Prerequisites are confined to the same course: a foreign slug resolves to
 * nothing under `evaluateLessonLock`, which only ever searches the course it
 * was handed, so accepting one would persist a gate that can never fire.
 *
 * Deliberately NO cycle check, unlike `updateModuleDependencies`. Cycles are
 * impossible here by construction rather than by validation: expansion drops
 * every edge pointing at a later lesson, so each surviving edge runs strictly
 * backwards and no set of them can close a loop. Validating at write time
 * would also be insufficient on its own — a drag re-ranks lessons and could
 * create a cycle with nobody editing a dependency at all.
 */
export async function updateLessonDependencies(
  lessonId: number,
  dependsOn: string[],
): Promise<UpdateLessonDependenciesResult> {
  const [target] = await db
    .select({ courseId: modulesTable.courseId })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .where(eq(lessonsTable.id, lessonId));
  if (!target) return { ok: false, reason: 'not-found' };

  // Order-preserving dedupe: a duplicated slug is a client bug, not a reason
  // to fail the write, but it must not reach a column the UI renders as chips.
  const next = [...new Set(dependsOn)];

  const siblings = await db
    .select({ slug: lessonsTable.slug })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .where(eq(modulesTable.courseId, target.courseId));
  const known = new Set(siblings.map((s) => s.slug));
  const unknown = next.filter((slug) => !known.has(slug));
  if (unknown.length > 0) {
    return { ok: false, reason: 'unknown-lessons', slugs: unknown };
  }

  // moduleSlug is deliberately not stored. Lesson slugs are globally unique,
  // so it is redundant for lookup, and a stored one goes stale the moment a
  // lesson moves module — which is exactly how gates used to vanish silently.
  const rows = next.map((lessonSlug) => ({ lessonSlug }));

  // Clearing every prerequisite deletes the row rather than storing an empty
  // array, so "no explicit prerequisites" has one representation instead of
  // two — and an empty array would otherwise read as "off the chain", which
  // is the opposite of what clearing means.
  if (rows.length === 0) {
    await db
      .delete(lessonDependenciesTable)
      .where(eq(lessonDependenciesTable.lessonId, lessonId));
  } else {
    await db
      .insert(lessonDependenciesTable)
      .values({ lessonId, dependsOn: rows })
      .onConflictDoUpdate({
        target: lessonDependenciesTable.lessonId,
        set: { dependsOn: rows },
      });
  }

  await invalidateCourseDetailsCache(await getCourseSlugForLessonId(lessonId));
  return { ok: true, dependsOn: rows };
}

/** Turn a module's derived lesson chain on or off. */
export async function updateModuleSequential(
  moduleId: number,
  sequentialLessons: boolean,
): Promise<boolean> {
  const [updated] = await db
    .update(modulesTable)
    .set({ sequentialLessons, updatedAt: sql`now()` })
    .where(eq(modulesTable.id, moduleId))
    .returning({ id: modulesTable.id });
  if (!updated) return false;

  await invalidateCourseDetailsCache(await getCourseSlugForModuleId(moduleId));
  return true;
}

// Grace period so a just-uploaded-but-not-yet-saved cover isn't swept while the
// admin is still filling in the form.
const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
// Blob path prefixes we own. MUST stay in sync with the referenced-URL
// collection in sweepOrphanBlobs — only sweep a prefix whose references we
// gather, else live blobs get deleted. When lessons gain 16:9 covers, add
// 'lessons/' here AND collect lesson image URLs below.
const SWEPT_PREFIXES = ['courses/', 'modules/'];

/**
 * Periodic orphan sweep (Vercel Cron): delete cover blobs under our prefixes
 * that no course/module row references and that are older than the grace
 * period. Catches images uploaded but never saved (abandoned dialogs).
 */
export async function sweepOrphanBlobs(): Promise<{
  scanned: number;
  deleted: number;
}> {
  const [courseRows, moduleRows] = await Promise.all([
    db
      .select({
        avif: coursesTable.imageUrlAvif,
        webp: coursesTable.imageUrlWebp,
      })
      .from(coursesTable),
    db
      .select({
        avif: modulesTable.imageUrlAvif,
        webp: modulesTable.imageUrlWebp,
      })
      .from(modulesTable),
  ]);
  const referenced = new Set<string>();
  for (const row of [...courseRows, ...moduleRows]) {
    if (row.avif) referenced.add(row.avif);
    if (row.webp) referenced.add(row.webp);
  }

  const now = Date.now();
  const orphans: string[] = [];
  let scanned = 0;
  for (const prefix of SWEPT_PREFIXES) {
    let cursor: string | undefined;
    do {
      const page = await list({
        token: env.BLOB_READ_WRITE_TOKEN,
        prefix,
        cursor,
        limit: 1000,
      });
      for (const blob of page.blobs) {
        scanned++;
        const age = now - blob.uploadedAt.getTime();
        if (age > ORPHAN_MIN_AGE_MS && !referenced.has(blob.url)) {
          orphans.push(blob.url);
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }

  for (let i = 0; i < orphans.length; i += 100) {
    await deleteBlobs(orphans.slice(i, i + 100));
  }
  return { scanned, deleted: orphans.length };
}

/** Delete blobs by public URL. Non-fatal: a failure just leaves an orphan. */
async function deleteBlobs(
  urls: Array<string | null | undefined>,
): Promise<void> {
  const targets = urls.filter((u): u is string => Boolean(u));
  if (targets.length === 0) return;
  try {
    await del(targets, { token: env.BLOB_READ_WRITE_TOKEN });
  } catch (error) {
    console.error('Failed to delete blob(s):', error);
  }
}

/** Delete previously-stored image blobs that a save has replaced or cleared. */
async function deleteReplacedImageBlobs(
  previous: { avif: string | null; webp: string | null },
  next: { avif: string | null; webp: string | null },
): Promise<void> {
  const stale: Array<string | null> = [];
  if (previous.avif && previous.avif !== next.avif) stale.push(previous.avif);
  if (previous.webp && previous.webp !== next.webp) stale.push(previous.webp);
  await deleteBlobs(stale);
}

export async function updateModule(
  moduleId: number,
  input: {
    name: string;
    imageUrlAvif?: string | null;
    imageUrlWebp?: string | null;
  },
): Promise<{ id: number; name: string } | null> {
  const [existing] = await db
    .select({
      imageUrlAvif: modulesTable.imageUrlAvif,
      imageUrlWebp: modulesTable.imageUrlWebp,
    })
    .from(modulesTable)
    .where(eq(modulesTable.id, moduleId));

  const [updated] = await db
    .update(modulesTable)
    .set({
      name: input.name,
      imageUrlAvif: input.imageUrlAvif ?? null,
      imageUrlWebp: input.imageUrlWebp ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(modulesTable.id, moduleId))
    .returning({ id: modulesTable.id, name: modulesTable.name });
  if (!updated) return null;

  await deleteReplacedImageBlobs(
    {
      avif: existing?.imageUrlAvif ?? null,
      webp: existing?.imageUrlWebp ?? null,
    },
    { avif: input.imageUrlAvif ?? null, webp: input.imageUrlWebp ?? null },
  );
  await invalidateCourseDetailsCache(await getCourseSlugForModuleId(moduleId));
  return updated;
}

/**
 * Why a dependency write was refused, so the route can pick a status code
 * without re-deriving the reason.
 */
export type UpdateModuleDependenciesResult =
  | { ok: true; dependsOn: string[] }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'unknown-modules'; slugs: string[] }
  | { ok: false; reason: 'cycle'; slugs: string[] };

/**
 * Replace a module's prerequisites, rejecting anything that would deadlock.
 *
 * Validation runs against live rows rather than trusting the request: the
 * client disables cycle-forming options, but two admins in two tabs can each
 * pick a legal edge that is jointly a cycle, and a cycle locks both modules
 * permanently with no signal to anyone. Prerequisites are also confined to the
 * same course — a foreign slug is silently inert under `evaluateLessonLock`,
 * which searches only the current course's modules, so accepting one would
 * persist a gate that can never fire.
 */
export async function updateModuleDependencies(
  moduleId: number,
  dependsOn: string[],
): Promise<UpdateModuleDependenciesResult> {
  const [target] = await db
    .select({ slug: modulesTable.slug, courseId: modulesTable.courseId })
    .from(modulesTable)
    .where(eq(modulesTable.id, moduleId));
  if (!target) return { ok: false, reason: 'not-found' };

  const siblings = await db
    .select({
      slug: modulesTable.slug,
      dependsOn: moduleDependenciesTable.dependsOn,
    })
    .from(modulesTable)
    .leftJoin(
      moduleDependenciesTable,
      eq(moduleDependenciesTable.moduleId, modulesTable.id),
    )
    .where(eq(modulesTable.courseId, target.courseId));

  // Order-preserving dedupe: a duplicated slug is a client bug, not a reason
  // to fail the write, but it must not reach a column the UI renders as chips.
  const next = [...new Set(dependsOn)];

  const known = new Set(siblings.map((s) => s.slug));
  const unknown = next.filter((slug) => !known.has(slug));
  if (unknown.length > 0) {
    return { ok: false, reason: 'unknown-modules', slugs: unknown };
  }

  const graph = siblings.map((s) => ({
    slug: s.slug,
    name: s.slug,
    dependsOn: s.dependsOn ?? [],
    lessons: [],
  }));
  const forbidden = cyclicPrerequisites(graph, target.slug);
  const cyclic = next.filter((slug) => forbidden.has(slug));
  if (cyclic.length > 0) return { ok: false, reason: 'cycle', slugs: cyclic };

  // Clearing every prerequisite deletes the row rather than storing an empty
  // array, so "no dependencies" has one representation instead of two.
  if (next.length === 0) {
    await db
      .delete(moduleDependenciesTable)
      .where(eq(moduleDependenciesTable.moduleId, moduleId));
  } else {
    await db
      .insert(moduleDependenciesTable)
      .values({ moduleId, dependsOn: next })
      .onConflictDoUpdate({
        target: moduleDependenciesTable.moduleId,
        set: { dependsOn: next },
      });
  }

  await invalidateCourseDetailsCache(await getCourseSlugForModuleId(moduleId));
  return { ok: true, dependsOn: next };
}

export async function deleteModule(moduleId: number): Promise<boolean> {
  const [existing] = await db
    .select({
      slug: modulesTable.slug,
      imageUrlAvif: modulesTable.imageUrlAvif,
      imageUrlWebp: modulesTable.imageUrlWebp,
    })
    .from(modulesTable)
    .where(eq(modulesTable.id, moduleId));

  // Resolve before the delete — once the row is gone, the course join used
  // to find the owning slug has nothing to join against.
  const courseSlug = await getCourseSlugForModuleId(moduleId);

  const [deleted] = await db
    .delete(modulesTable)
    .where(eq(modulesTable.id, moduleId))
    .returning({ id: modulesTable.id });
  if (!deleted) return false;

  // The cascade drops this module's OWN dependency row, but `depends_on` is a
  // plain text[] with no foreign key — every sibling that listed this slug
  // would keep it forever. Gating tolerates such orphans, so nothing breaks;
  // the admin would just see a chip for a prerequisite that no longer exists,
  // implying a gate that is not there.
  if (existing?.slug) {
    await db
      .update(moduleDependenciesTable)
      .set({
        dependsOn: sql`array_remove(${moduleDependenciesTable.dependsOn}, ${existing.slug})`,
      })
      .where(sql`${existing.slug} = ANY(${moduleDependenciesTable.dependsOn})`);
  }

  await deleteBlobs([existing?.imageUrlAvif, existing?.imageUrlWebp]);
  await invalidateCourseDetailsCache(courseSlug);
  return true;
}

/**
 * Update a course's editable fields. Slug is intentionally left unchanged (like
 * module rename) so existing URLs keep working. Returns null if no such course.
 */
export async function updateCourse(
  courseId: number,
  input: UpdateCourseInput,
): Promise<DBCourse | null> {
  const [existing] = await db
    .select({
      imageUrlAvif: coursesTable.imageUrlAvif,
      imageUrlWebp: coursesTable.imageUrlWebp,
    })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));

  const [updated] = await db
    .update(coursesTable)
    .set({
      name: input.name,
      description: input.description ?? null,
      imageUrlAvif: input.imageUrlAvif ?? null,
      imageUrlWebp: input.imageUrlWebp ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(coursesTable.id, courseId))
    .returning();
  if (!updated) return null;

  await deleteReplacedImageBlobs(
    {
      avif: existing?.imageUrlAvif ?? null,
      webp: existing?.imageUrlWebp ?? null,
    },
    { avif: updated.imageUrlAvif, webp: updated.imageUrlWebp },
  );
  // Slug is immutable here (see doc comment), so the row just returned
  // already carries the key the cache is keyed by — no extra lookup needed.
  await invalidateCourseDetailsCache(updated.slug);
  return updated;
}

export async function getCourseOnboarding(
  courseId: number,
): Promise<OnboardingQuestions> {
  const [row] = await db
    .select({ onboardingQuestions: coursesTable.onboardingQuestions })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));
  return row?.onboardingQuestions ?? [];
}

export async function updateCourseOnboarding(
  courseId: number,
  questions: OnboardingQuestions,
): Promise<OnboardingQuestions> {
  await db
    .update(coursesTable)
    .set({ onboardingQuestions: questions, updatedAt: new Date() })
    .where(eq(coursesTable.id, courseId));
  await invalidateCourseDetailsCache(await getCourseSlugForCourseId(courseId));
  return questions;
}

/** Delete a course; its modules and lessons cascade via FK. */
export async function deleteCourse(courseId: number): Promise<boolean> {
  // Collect the course cover and every cascade-deleted module cover so their
  // blobs can be removed after the row is gone. Also grab the slug here,
  // before the delete — once the row is gone there is nothing left to
  // resolve it from.
  const [course] = await db
    .select({
      slug: coursesTable.slug,
      imageUrlAvif: coursesTable.imageUrlAvif,
      imageUrlWebp: coursesTable.imageUrlWebp,
    })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));
  const moduleImages = await db
    .select({
      imageUrlAvif: modulesTable.imageUrlAvif,
      imageUrlWebp: modulesTable.imageUrlWebp,
    })
    .from(modulesTable)
    .where(eq(modulesTable.courseId, courseId));

  const [deleted] = await db
    .delete(coursesTable)
    .where(eq(coursesTable.id, courseId))
    .returning({ id: coursesTable.id });
  if (!deleted) return false;

  await invalidateCourseDetailsCache(course?.slug ?? null);
  await deleteBlobs([
    course?.imageUrlAvif,
    course?.imageUrlWebp,
    ...moduleImages.flatMap((m) => [m.imageUrlAvif, m.imageUrlWebp]),
  ]);
  return true;
}
