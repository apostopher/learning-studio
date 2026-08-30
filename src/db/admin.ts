import { del, list } from '@vercel/blob';
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  like,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { invalidateCourseDetailsCache } from '#/db/course-cache';
import { linkCourseToOrg } from '#/db/course-orgs';
import {
  getCourseSlugForCourseId,
  getCourseSlugForModuleId,
  getCourseSlugsForLessonId,
} from '#/db/lesson-access';
import { getLessonPlayback } from '#/db/lesson-playback';
import { getLessonTranscript } from '#/db/lesson-transcript';
import { getPlacementsForCourse, movePlacement } from '#/db/placements';
import type { DBCourse } from '#/db/schema';
import {
  coursesTable,
  courseVideoProvidersTable,
  lessonsTable,
  moduleDependenciesTable,
  moduleLessonsTable,
  modulesTable,
  newsSourcesTable,
  videoProgressTable,
} from '#/db/schema';
import { env } from '#/env';
import { getVideoThumbnailsWithCache } from '#/integrations/synthesia/thumbnails';
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
import { PlaybackError } from '#/lib/video-providers/errors';
import { buildLessonPosters } from '#/lib/video-providers/posters.server';
import {
  type PlaybackResult,
  resolvePlayback,
  validateCredentials,
} from '#/lib/video-providers/resolve.server';
import type {
  CourseLessonDependency,
  OnboardingQuestions,
  SubscriptionType,
  UserLevel,
} from '#/types';
import { db } from '.';

// re-export so existing importers of AdminCourseSummary from "@/db/admin" keep working
export type { AdminCourseSummary } from '#/lib/admin-schemas';

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
    // The transcript goes with it: it is the previous video's captions,
    // flattened and cached for a week (far longer than any signed URL), and it
    // is what a material-less lesson's debrief is generated from. Left behind,
    // the new video would be debriefed on the old one's script.
    await Promise.all([
      getLessonPlayback.invalidate(lessonSlug),
      getLessonTranscript.invalidate(lessonSlug),
    ]);
  } catch (error) {
    console.error('Failed to invalidate lesson-playback cache:', error);
  }
}

/**
 * Evict the learner-facing course-details cache for EVERY course that
 * teaches this lesson.
 *
 * A lesson can now be placed into several courses via `module_lessons`, so an
 * admin edit to one lesson can change what several courses show. Invalidating
 * only one slug (the bug this closes) would leave the others serving stale
 * content until the 6h TTL expires. `invalidateCourseDetailsCache` is itself
 * best-effort per slug, so a failure on one course doesn't stop the others
 * from being invalidated.
 */
async function invalidateAllCoursesForLesson(lessonId: number): Promise<void> {
  const slugs = await getCourseSlugsForLessonId(lessonId);
  await Promise.all(slugs.map((slug) => invalidateCourseDetailsCache(slug)));
}

/**
 * Evict the Redis-cached Synthesia thumbnail sweep for a course when its
 * credential is saved, so a corrected API key's posters appear on the next
 * board load instead of after up to 6h. That long a wait is real, not
 * theoretical: `getVideoExpiry` returns `null` for a thumbnail URL with no
 * `Expires` param, and `computeThumbnailCacheTTL` then falls back to its
 * `MAX_TTL_SECONDS` — so a video rendered after the last sweep can sit
 * posterless for hours with no admin recourse until this fires.
 *
 * Keyed on the credential actually being saved (not a placeholder) even
 * though `getVideoThumbnailsWithCache`'s keyGenerator only uses `courseId`
 * today — if that generator ever starts keying on the API key too, a
 * placeholder here would silently stop invalidating anything.
 *
 * Only Synthesia sweeps through this cache; Mux posters are signed locally
 * per request and have nothing to invalidate.
 *
 * Best-effort, same pattern as `invalidateCourseDetailsCache`: a Redis
 * outage must not turn a successful credential save into a failed response.
 */
async function invalidateSynthesiaThumbnailsCache(
  courseId: number,
  apiKey: string,
): Promise<void> {
  try {
    await getVideoThumbnailsWithCache.invalidate({ courseId, apiKey });
  } catch (error) {
    console.error('Failed to invalidate Synthesia thumbnail cache:', error);
  }
}

/**
 * Courses with their module and lesson counts, newest-updated first.
 *
 * `courseIds` narrows the result to exactly those courses. It exists for the
 * staff-scoped view of `/admin`: a subject expert has no `course:read` and no
 * business seeing the catalogue, but must still reach the courses they author.
 * An empty array is NOT the same as omitting the argument — it means "these
 * zero courses", so the caller decides what no membership should do rather
 * than falling through to the whole catalogue.
 */
export async function listAdminCourses(
  courseIds?: number[],
): Promise<AdminCourseSummary[]> {
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
    // Membership now comes from the placement, not `lessons.module_id`: a
    // lesson joins through `module_lessons` scoped to THIS course's own
    // modules, so `countDistinct(lessonsTable.id)` cannot double-count —
    // by CONVENTION at most one placement per (course, lesson) (`linkLesson`
    // in placements.ts checks-then-inserts; the DB's own unique index is
    // only per module_id+lesson_id, not per course), so a lesson never
    // appears twice under the same course's modules here.
    .leftJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.moduleId, modulesTable.id),
    )
    .leftJoin(lessonsTable, eq(lessonsTable.id, moduleLessonsTable.lessonId))
    .where(courseIds ? inArray(coursesTable.id, courseIds) : undefined)
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

// Moved to `#/db/user-roles` so the client graph can reach it without pulling
// this module's server-only imports (crypto.server, resolve.server,
// posters.server) into the browser bundle. Re-exported for existing callers.
export { getUserRoleNames } from '#/db/user-roles';

/**
 * `orgId` is passed in rather than read from `getActiveOrgId()` here: this
 * module is reachable from the client graph (`__root.tsx` →
 * `auth-functions.ts` → `getUserRoleNames`), so importing a `.server.ts`
 * module fails the client build's import-protection. Reading deployment
 * configuration is the route layer's job anyway.
 */
export async function createCourse(
  input: CreateCourseInput,
  orgId: number,
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

  // Whatever this deployment administers, it owns what it creates. Without
  // this the course has no `course_orgs` row, so the AI-training modal would
  // open its Persona tab with nowhere to store a selection.
  await linkCourseToOrg(created.id, orgId);

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

  // Scoped by placement, not `lessons.module_id`: `linkLesson`/`movePlacement`
  // never touch the legacy column, so the max rank among lessons whose legacy
  // `module_id` names this module can already disagree with what
  // `module_lessons` actually holds for it — that staleness is the exact bug
  // this scoping fixes.
  const [{ maxRank }] = await db
    .select({ maxRank: sql<string | null>`max(${moduleLessonsTable.rank})` })
    .from(moduleLessonsTable)
    .where(eq(moduleLessonsTable.moduleId, input.moduleId));
  const rank = maxRank === null ? 1 : Number(maxRank) + 1;

  // Transitional dual-write (Task 5a fix round 1): readers resolve a
  // lesson's course through `module_lessons` now, but this insert still
  // writes `lessons.module_id`/`lessons.rank` too, until
  // `migrate-drop-lesson-module-id.ts` (named in
  // `migrate-lesson-placements.ts`'s header comment, not yet written) drops
  // those columns once every writer has moved. Without the `module_lessons`
  // row, a freshly created lesson has NO placement, so every course-scoped
  // reader — the learner lesson page, playback, the five admin lesson
  // routes — resolves no course for it and 404s. Both inserts happen in one
  // transaction: a lesson that exists in `lessons` but not in
  // `module_lessons` (or vice versa) is exactly that bug.
  const [created] = await db.transaction(async (tx) => {
    const [insertedLesson] = await tx
      .insert(lessonsTable)
      .values({
        moduleId: input.moduleId,
        name: input.name,
        slug,
        requiredSubscriptions: [],
        rank: String(rank),
      })
      .returning();

    await tx.insert(moduleLessonsTable).values({
      moduleId: input.moduleId,
      lessonId: insertedLesson.id,
      // Reuses the same rank just computed for the legacy column, rather
      // than an independent `rankBetween` midpoint calc (as `linkLesson`
      // does) — both columns should agree on "last in the module" for a
      // brand new lesson, and computing it twice by different means is how
      // they'd quietly drift apart.
      rank: String(rank),
      dependsOn: [],
    });

    return [insertedLesson];
  });

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
    levels: created.levels as UserLevel[],
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
 * Joined directly on `videos_progress.lesson_id = module_lessons.lesson_id` —
 * both integers, no cast needed now that progress is keyed on lesson id
 * rather than the Synthesia video id. Attributed by the PLACEMENT's module
 * (`module_lessons.module_id`), not the lesson's legacy `module_id`: a
 * shared-library lesson's own column can name a module in a DIFFERENT
 * course entirely, which would attribute its learners to the wrong module
 * (or one outside `moduleIds` altogether, silently dropping them). Only
 * modules with progress appear in the result; callers default the rest to
 * zero.
 */
async function countLearnersByModule(
  moduleIds: number[],
): Promise<Map<number, number>> {
  const rows = await db
    .select({
      moduleId: moduleLessonsTable.moduleId,
      learners: countDistinct(videoProgressTable.userId),
    })
    .from(moduleLessonsTable)
    .innerJoin(
      videoProgressTable,
      and(
        eq(videoProgressTable.lessonId, moduleLessonsTable.lessonId),
        inArray(videoProgressTable.progress, watchedMilestones),
      ),
    )
    .where(inArray(moduleLessonsTable.moduleId, moduleIds))
    .groupBy(moduleLessonsTable.moduleId);

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

  // Placements — not `lessons.module_id` — decide which lessons belong to
  // this course, which module each sits in, and what order: a lesson can
  // sit third in one course and eighth in another, so `lessons.rank` cannot
  // decide this. The lesson row still supplies name, video and every gate.
  // Fetched alongside `modules` rather than after: it depends only on
  // `courseId`, not on the module rows, so there is nothing to sequence.
  const [modules, placements] = await Promise.all([
    db
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
      .orderBy(asc(modulesTable.rank), asc(modulesTable.id)),
    getPlacementsForCourse(courseId),
  ]);

  const moduleIds = modules.map((m) => m.id);
  const lessonIds = [...new Set(placements.map((p) => p.lessonId))];
  const lessonRows = lessonIds.length
    ? await db
        .select({
          id: lessonsTable.id,
          name: lessonsTable.name,
          slug: lessonsTable.slug,
          isAvailable: lessonsTable.isAvailable,
          hasDebrief: lessonsTable.hasDebrief,
          needsVideoWatch: lessonsTable.needsVideoWatch,
          requiredSubscriptions: lessonsTable.requiredSubscriptions,
          levels: lessonsTable.levels,
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
        .where(inArray(lessonsTable.id, lessonIds))
    : [];
  const lessonById = new Map(lessonRows.map((l) => [l.id, l]));

  const byModule = new Map<
    number,
    Array<
      (typeof lessonRows)[number] & {
        rank: number;
        dependsOn: CourseLessonDependency[];
      }
    >
  >();
  for (const placement of placements) {
    const lesson = lessonById.get(placement.lessonId);
    if (!lesson) continue;
    const list = byModule.get(placement.moduleId) ?? [];
    list.push({
      ...lesson,
      rank: placement.rank,
      dependsOn: placement.dependsOn,
    });
    byModule.set(placement.moduleId, list);
  }
  // Tiebreak on lesson id, same as the old SQL's `asc(lessonsTable.rank),
  // asc(lessonsTable.id)`: `rankBetween` can hand two placements the same
  // rank (two stale editor views both computing `prev + 1` / `next / 2` for
  // the same slot), and without a tiebreak `Array#sort`'s stability would
  // just preserve whatever arbitrary order Postgres returned the rows in —
  // the board could then reorder between renders for no reason.
  for (const list of byModule.values()) {
    list.sort((a, b) => a.rank - b.rank || a.id - b.id);
  }

  const [dependencies, learnerCounts] = moduleIds.length
    ? await Promise.all([
        db
          .select({
            moduleId: moduleDependenciesTable.moduleId,
            dependsOn: moduleDependenciesTable.dependsOn,
          })
          .from(moduleDependenciesTable)
          .where(inArray(moduleDependenciesTable.moduleId, moduleIds)),
        countLearnersByModule(moduleIds),
      ])
    : [[], new Map<number, number>()];

  const dependsOnByModule = new Map(
    dependencies.map((d) => [d.moduleId, d.dependsOn]),
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
        rank: l.rank,
        isAvailable: l.isAvailable,
        hasDebrief: l.hasDebrief,
        needsVideoWatch: l.needsVideoWatch,
        requiredSubscriptions: l.requiredSubscriptions as SubscriptionType[],
        levels: l.levels as UserLevel[],
        isConfigured: l.videoRef !== null,
        quizQuestionCount: Number(l.quizQuestionCount),
        dependsOn: l.dependsOn,
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
  if (input.provider === 'synthesia') {
    await invalidateSynthesiaThumbnailsCache(courseId, input.apiKey);
  }
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

  await invalidateAllCoursesForLesson(lessonId);
  // Evicted by slug (not the course slugs above) — `getLessonPlayback` is
  // keyed per-lesson, not per-course, so an unrelated course-details
  // invalidation would leave this lesson's stale playback entry untouched.
  await invalidateLessonPlaybackCache(updated.slug);

  return { id: updated.id };
}

export async function resolveLessonPlayback(
  lessonId: number,
  courseId: number,
): Promise<PlaybackResult | null> {
  // `courseId` is the course the route already resolved (and guarded on) —
  // fix round 1: previously this ran its own independent "lowest course id"
  // lookup, which happened to match the route's guard only because both used
  // the same tie-break, and once a lesson has provider credentials that
  // differ per course, an independently-resolved course can name one with no
  // credential at all even though the course actually being viewed has one.
  // Threading the caller's own courseId makes the permission check and the
  // credential lookup agree by construction instead of by coincidence.
  const [lesson] = await db
    .select({
      videoProvider: lessonsTable.videoProvider,
      videoRef: lessonsTable.videoRef,
    })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .innerJoin(modulesTable, eq(modulesTable.id, moduleLessonsTable.moduleId))
    .where(
      and(eq(lessonsTable.id, lessonId), eq(modulesTable.courseId, courseId)),
    );
  if (!lesson?.videoProvider || !lesson.videoRef) return null;
  const provider = lesson.videoProvider as ProviderId;
  const creds = await resolveCourseProvider(courseId, provider);
  // See resolveLessonPlaybackUncached: a missing credential is an admin
  // misconfiguration, not "no video", and must not collapse into the same
  // 404 the board reads as "nothing assigned".
  if (!creds) {
    throw new PlaybackError(
      'PROVIDER_NOT_CONFIGURED',
      `This course has no ${provider} credentials configured.`,
    );
  }
  return resolvePlayback(provider, lesson.videoRef, creds);
}

/**
 * Poster frames for every lesson in a course that has a video, as
 * `lessonId → url`. Lessons with no poster are absent — see
 * `buildLessonPosters`.
 */
export async function getCourseLessonPosters(
  courseId: number,
): Promise<Record<number, string>> {
  // Scoped by placement to THIS course, not the lesson's legacy module_id:
  // a shared-library lesson's own column can name a module in a different
  // course, which would either miss this course's poster entirely or (via a
  // stale legacy pointer) leak a poster into the wrong course. By CONVENTION
  // at most one placement per (course, lesson) — `linkLesson`'s check-then-
  // insert, not a DB constraint (the unique index is per module_id+lesson_id,
  // not per course) — so this join adds no more than one row per lesson in
  // practice; no dedup needed downstream.
  const rows = await db
    .select({
      id: lessonsTable.id,
      provider: lessonsTable.videoProvider,
      ref: lessonsTable.videoRef,
    })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .innerJoin(modulesTable, eq(modulesTable.id, moduleLessonsTable.moduleId))
    .where(
      and(
        eq(modulesTable.courseId, courseId),
        isNotNull(lessonsTable.videoProvider),
        isNotNull(lessonsTable.videoRef),
      ),
    );

  // The SQL guards both columns, but the column types stay nullable, so this
  // narrows rather than asserting.
  const lessons = rows.flatMap((row) =>
    row.provider && row.ref
      ? [{ id: row.id, provider: row.provider as ProviderId, ref: row.ref }]
      : [],
  );
  if (lessons.length === 0) return {};

  return buildLessonPosters({
    courseId,
    lessons,
    loadCredentials: (provider) => resolveCourseProvider(courseId, provider),
  });
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

  // Resolve every course currently teaching this lesson before touching
  // anything below. `getCourseSlugsForLessonId` reads through
  // `module_lessons` (Task 5a), and `movePlacement` next is about to
  // repoint this lesson's placement at the target module/course — reading
  // it AFTER that would already see the new course, not the old one, so the
  // "source" side of the invalidation would silently vanish.
  const sourceCourseSlugs = await getCourseSlugsForLessonId(input.lessonId);

  // Transitional dual-write (Task 5a fix round 1): `module_lessons` is what
  // readers resolve a lesson's course from now, but `lessons.module_id`/
  // `lessons.rank` are kept in sync until `migrate-drop-lesson-module-id.ts`
  // (named in `migrate-lesson-placements.ts`'s header comment, not yet
  // written) drops those columns. Both writes run in ONE transaction —
  // `movePlacement` takes the transaction's `tx` instead of the
  // module-level `db` — so a failure in either rolls back both: the legacy
  // column can never end up moved while the placement (what every reader
  // now trusts) stayed behind, or vice versa. That divergence is exactly
  // what turned a cross-course move into a 500 on the learner lesson page.
  const updated = await db.transaction(async (tx) => {
    const movedPlacement = await movePlacement(
      {
        lessonId: input.lessonId,
        targetModuleId: input.targetModuleId,
        prevLessonId: input.prevLessonId,
        nextLessonId: input.nextLessonId,
      },
      tx,
    );
    if (!movedPlacement) return null;

    const [updatedLesson] = await tx
      .update(lessonsTable)
      .set({
        moduleId: input.targetModuleId,
        rank: rankExpr,
        updatedAt: sql`now()`,
      })
      .where(eq(lessonsTable.id, input.lessonId))
      // `moduleId` is NOT read back here: the caller's own `input
      // .targetModuleId` — just written above — is authoritative, and
      // reading it from `lessonsTable` would be a read of the legacy column
      // this task is removing every OTHER read of.
      .returning({
        id: lessonsTable.id,
        rank: lessonsTable.rank,
      });
    return updatedLesson
      ? { ...updatedLesson, moduleId: input.targetModuleId }
      : null;
  });
  if (!updated) return null;

  const targetCourseSlug = await getCourseSlugForModuleId(input.targetModuleId);
  // De-duplicated via Set so a reorder that lands back in a course already
  // covered by `sourceCourseSlugs` doesn't invalidate that slug twice.
  const slugsToInvalidate = new Set(sourceCourseSlugs);
  if (targetCourseSlug) slugsToInvalidate.add(targetCourseSlug);
  await Promise.all(
    [...slugsToInvalidate].map((slug) => invalidateCourseDetailsCache(slug)),
  );

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

  await invalidateAllCoursesForLesson(lessonId);

  return updated;
}

export async function updateLessonConfig(
  lessonId: number,
  patch: {
    isAvailable?: boolean;
    hasDebrief?: boolean;
    needsVideoWatch?: boolean;
    requiredSubscriptions?: SubscriptionType[];
    levels?: UserLevel[];
  },
): Promise<{
  id: number;
  isAvailable: boolean;
  hasDebrief: boolean;
  needsVideoWatch: boolean;
  requiredSubscriptions: SubscriptionType[];
  levels: UserLevel[];
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
      levels: lessonsTable.levels,
    });
  if (!updated) return null;

  await invalidateAllCoursesForLesson(lessonId);

  return {
    ...updated,
    requiredSubscriptions: updated.requiredSubscriptions as SubscriptionType[],
    levels: updated.levels as UserLevel[],
  };
}

export async function deleteLesson(lessonId: number): Promise<boolean> {
  // Resolve before the delete — once the row is gone, the module/course join
  // used to find the owning slug(s) has nothing to join against. A lesson
  // placed into several courses via `module_lessons` means several courses
  // can be losing this lesson at once, and every one needs invalidating.
  const courseSlugs = await getCourseSlugsForLessonId(lessonId);

  const [deleted] = await db
    .delete(lessonsTable)
    .where(eq(lessonsTable.id, lessonId))
    .returning({ id: lessonsTable.id, slug: lessonsTable.slug });
  if (!deleted) return false;

  // Strip the dead slug from every dependent PLACEMENT's `dependsOn`
  // (`module_lessons`, not the legacy `lesson_dependencies`), exactly as
  // deleteModule does with array_remove for modules. depends_on is JSONB
  // objects rather than a text array, so the equivalent is a filtered
  // re-aggregation. Not scoped to the deleted lesson's own (currently
  // teaching) courses — deliberately broader than the invalidation below,
  // which IS scoped to `courseSlugs`. Today the two sets are actually equal:
  // `updateLessonDependencies` only ever lets a lesson depend on a SIBLING
  // in the same course, validated against that course's placements at write
  // time, and `linkLesson`/`unlinkLesson` (placements.ts) have zero callers
  // — so a lesson has exactly one placement for its whole life and no path
  // exists yet to leave a dangling cross-course reference. This unscoped
  // WHERE is defence in depth against the day `unlinkLesson` gets a caller:
  // unlinking a lesson from a course does not (and per that function's own
  // doc comment, should not) retroactively strip that course's OTHER
  // lessons' now-stale references to it, so a slug could then survive in a
  // course that no longer teaches it — this delete-time sweep is the
  // backstop for exactly that leftover. Without this, dependents keep an
  // edge to a lesson that no longer exists: the gate tolerates it
  // (unresolvable edges are skipped) but the admin UI would render a chip
  // for a prerequisite that isn't there, and it accumulates forever.
  await db
    .update(moduleLessonsTable)
    .set({
      dependsOn: sql`coalesce((
        select jsonb_agg(entry)
        from jsonb_array_elements(${moduleLessonsTable.dependsOn}) entry
        where entry->>'lessonSlug' <> ${deleted.slug}
      ), '[]'::jsonb)`,
      updatedAt: sql`now()`,
    })
    .where(
      sql`${moduleLessonsTable.dependsOn} @> ${JSON.stringify([{ lessonSlug: deleted.slug }])}::jsonb`,
    );

  await Promise.all(
    courseSlugs.map((slug) => invalidateCourseDetailsCache(slug)),
  );
  return true;
}

export type UpdateLessonDependenciesResult =
  | { ok: true; dependsOn: { lessonSlug: string }[] }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'unknown-lessons'; slugs: string[] };

/**
 * Replace one lesson's explicit prerequisites, IN ONE COURSE.
 *
 * Prerequisites now live on the placement (`module_lessons.depends_on`), not
 * on the lesson itself — see that table's doc comment in schema.ts. A lesson
 * shared by several courses can therefore have a DIFFERENT prerequisite list
 * per course, and this write only ever touches the one placement named by
 * `courseId`; it must never fan out to every course teaching this lesson,
 * or an edit meant for one course's chain would silently rewrite another's.
 *
 * `courseId` is the course the CLIENT is asking to edit — sent explicitly in
 * the request body (`updateLessonDependenciesInputSchema`), not derived from
 * the lesson alone. Fix round 1: it was previously the lowest-id course the
 * route resolved purely to guard the request, which was only ever correct
 * because `linkLesson` had zero callers and a lesson therefore had exactly
 * one placement — that justification expires the moment linking ships. A
 * forged or stale `courseId` can't do damage beyond its own scope: the
 * `not-found` branch below rejects any courseId this lesson has no placement
 * in, so the write can only ever land on a real placement, never invent or
 * hijack one.
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
  courseId: number,
  dependsOn: string[],
): Promise<UpdateLessonDependenciesResult> {
  // The placement this write targets: THIS lesson, placed in THIS course.
  // `not-found` covers both "no such lesson" and "this lesson isn't taught
  // by this course" — the caller (patchLessonHandler) already 404s before
  // resolving a courseId at all when the lesson doesn't exist, so in
  // practice this branch fires for the latter.
  const [target] = await db
    .select({ placementId: moduleLessonsTable.id })
    .from(moduleLessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, moduleLessonsTable.moduleId))
    .where(
      and(
        eq(moduleLessonsTable.lessonId, lessonId),
        eq(modulesTable.courseId, courseId),
      ),
    );
  if (!target) return { ok: false, reason: 'not-found' };

  // Order-preserving dedupe: a duplicated slug is a client bug, not a reason
  // to fail the write, but it must not reach a column the UI renders as chips.
  const next = [...new Set(dependsOn)];

  // Siblings are every lesson placed in THIS course — reached through the
  // placement, not the lessons' own (legacy) module_id, for the same reason
  // as everywhere else in this file.
  const siblings = await db
    .select({ slug: lessonsTable.slug })
    .from(lessonsTable)
    .innerJoin(
      moduleLessonsTable,
      eq(moduleLessonsTable.lessonId, lessonsTable.id),
    )
    .innerJoin(modulesTable, eq(modulesTable.id, moduleLessonsTable.moduleId))
    .where(eq(modulesTable.courseId, courseId));
  const known = new Set(siblings.map((s) => s.slug));
  const unknown = next.filter((slug) => !known.has(slug));
  if (unknown.length > 0) {
    return { ok: false, reason: 'unknown-lessons', slugs: unknown };
  }

  // moduleSlug is deliberately not stored. Lesson slugs are globally unique,
  // so it is redundant for lookup, and a stored one goes stale the moment a
  // lesson moves module — which is exactly how gates used to vanish silently.
  const rows = next.map((lessonSlug) => ({ lessonSlug }));

  // No delete-vs-upsert branch needed here, unlike the old
  // `lesson_dependencies` row (which could be absent entirely): every
  // placement always has a `module_lessons` row with a `depends_on` column
  // that defaults to `[]`, so "no explicit prerequisites" already has
  // exactly one representation — an empty array — with nothing else to
  // reconcile it against.
  await db
    .update(moduleLessonsTable)
    .set({ dependsOn: rows, updatedAt: sql`now()` })
    .where(eq(moduleLessonsTable.id, target.placementId));

  // Only THIS course's cache needs invalidating — the write touched exactly
  // one placement, so every other course teaching this lesson still shows
  // its own, unaffected, prerequisite chain.
  await invalidateCourseDetailsCache(await getCourseSlugForCourseId(courseId));
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
const SWEPT_PREFIXES = ['courses/', 'modules/', 'news-sources/'];

/**
 * Periodic orphan sweep (Vercel Cron): delete cover blobs under our prefixes
 * that no course/module row references and that are older than the grace
 * period. Catches images uploaded but never saved (abandoned dialogs).
 */
export async function sweepOrphanBlobs(): Promise<{
  scanned: number;
  deleted: number;
}> {
  // One select per swept prefix. Adding a prefix above WITHOUT adding its
  // reference query here deletes every live image under it on the next run.
  const [courseRows, moduleRows, newsSourceRows] = await Promise.all([
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
    db
      .select({
        avif: newsSourcesTable.imageUrlAvif,
        webp: newsSourcesTable.imageUrlWebp,
        // Third reference column, not a third format: `image_url` holds a
        // ready-made logo (usually SVG). Omitting it here would let the sweep
        // delete every migrated logo, since they live under `news-sources/`.
        plain: newsSourcesTable.imageUrl,
      })
      .from(newsSourcesTable),
  ]);
  const referenced = new Set<string>();
  for (const row of [...courseRows, ...moduleRows, ...newsSourceRows]) {
    if (row.avif) referenced.add(row.avif);
    if (row.webp) referenced.add(row.webp);
  }
  // Separate pass: only news sources carry a third reference column, and
  // widening the shared loop to reach it would silently type as `{}`.
  for (const row of newsSourceRows) {
    if (row.plain) referenced.add(row.plain);
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
