import { del, list } from '@vercel/blob';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  like,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { DBCourse } from '@/db/schema';
import {
  coursesTable,
  courseVideoProvidersTable,
  lessonsTable,
  modulesTable,
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
} from '@/db/schema';
import { env } from '@/env';
import type {
  AdminCourseSummary,
  BoardLesson,
  BoardModule,
  CourseBoard,
  CreateCourseInput,
  CredentialSummary,
  SaveCredentialInput,
  UpdateCourseInput,
} from '@/lib/admin-schemas';
import {
  decryptJson,
  encryptJson,
  type SecretEnvelope,
} from '@/lib/crypto.server';
import { slugify } from '@/lib/slugify';
import { type ProviderId, VIDEO_PROVIDERS } from '@/lib/video-providers';
import {
  type Playback,
  resolvePlayback,
  validateCredentials,
} from '@/lib/video-providers/resolve.server';
import type { OnboardingQuestions, SubscriptionType } from '@/types';
import { db } from '.';

// re-export so existing importers of AdminCourseSummary from "@/db/admin" keep working
export type { AdminCourseSummary } from '@/lib/admin-schemas';

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

  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    imageUrlAvif: created.imageUrlAvif,
    imageUrlWebp: created.imageUrlWebp,
    rank: Number(created.rank),
    requiredSubscriptions: created.requiredSubscriptions as SubscriptionType[],
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

  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    rank: Number(created.rank),
    isAvailable: created.isAvailable,
    hasDebrief: created.hasDebrief,
    needsVideoWatch: created.needsVideoWatch,
    requiredSubscriptions: created.requiredSubscriptions as SubscriptionType[],
    isConfigured: created.videoId !== null,
    videoProvider: created.videoProvider as ProviderId | null,
    videoRef: created.videoRef,
  };
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
          videoId: lessonsTable.videoId,
          videoProvider: lessonsTable.videoProvider,
          videoRef: lessonsTable.videoRef,
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
      lessons: (byModule.get(m.id) ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        rank: Number(l.rank),
        isAvailable: l.isAvailable,
        hasDebrief: l.hasDebrief,
        needsVideoWatch: l.needsVideoWatch,
        requiredSubscriptions: l.requiredSubscriptions as SubscriptionType[],
        isConfigured: l.videoRef !== null || l.videoId !== null,
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
    .returning({ id: lessonsTable.id });
  return updated ?? null;
}

export async function resolveLessonPlayback(
  lessonId: number,
): Promise<Playback | null> {
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

  return updated ? { id: updated.id, rank: Number(updated.rank) } : null;
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

  return updated
    ? { id: updated.id, rank: Number(updated.rank), moduleId: updated.moduleId }
    : null;
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
  return updated ?? null;
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
  return {
    ...updated,
    requiredSubscriptions: updated.requiredSubscriptions as SubscriptionType[],
  };
}

export async function deleteLesson(lessonId: number): Promise<boolean> {
  const [deleted] = await db
    .delete(lessonsTable)
    .where(eq(lessonsTable.id, lessonId))
    .returning({ id: lessonsTable.id });
  return Boolean(deleted);
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
  return updated;
}

export async function deleteModule(moduleId: number): Promise<boolean> {
  const [existing] = await db
    .select({
      imageUrlAvif: modulesTable.imageUrlAvif,
      imageUrlWebp: modulesTable.imageUrlWebp,
    })
    .from(modulesTable)
    .where(eq(modulesTable.id, moduleId));

  const [deleted] = await db
    .delete(modulesTable)
    .where(eq(modulesTable.id, moduleId))
    .returning({ id: modulesTable.id });
  if (!deleted) return false;

  await deleteBlobs([existing?.imageUrlAvif, existing?.imageUrlWebp]);
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
  return questions;
}

/** Delete a course; its modules and lessons cascade via FK. */
export async function deleteCourse(courseId: number): Promise<boolean> {
  // Collect the course cover and every cascade-deleted module cover so their
  // blobs can be removed after the row is gone.
  const [course] = await db
    .select({
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

  await deleteBlobs([
    course?.imageUrlAvif,
    course?.imageUrlWebp,
    ...moduleImages.flatMap((m) => [m.imageUrlAvif, m.imageUrlWebp]),
  ]);
  return true;
}
