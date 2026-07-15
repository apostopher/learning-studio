import { asc, desc, eq, inArray, like, or, type SQL, sql } from 'drizzle-orm';
import type { DBCourse } from '@/db/schema';
import {
  coursesTable,
  lessonsTable,
  modulesTable,
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
} from '@/db/schema';
import type {
  AdminCourseSummary,
  BoardLesson,
  BoardModule,
  CourseBoard,
  CreateCourseInput,
} from '@/lib/admin-schemas';
import { slugify } from '@/lib/slugify';
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
      imageUrl: input.imageUrl ?? null,
    })
    .returning();
  return created;
}

export async function createModule(input: {
  courseId: number;
  name: string;
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
      requiredSubscriptions: [],
      rank: String(rank),
    })
    .returning();

  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    rank: Number(created.rank),
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
    })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId));
  if (!course) return null;

  const modules = await db
    .select({
      id: modulesTable.id,
      name: modulesTable.name,
      slug: modulesTable.slug,
      rank: modulesTable.rank,
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
      rank: Number(m.rank),
      lessons: (byModule.get(m.id) ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        rank: Number(l.rank),
        isAvailable: l.isAvailable,
      })),
    })),
  };
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
